import { useCallback } from "react";
import {
  useMutation,
  useQueryClient,
  type DefaultError,
  type MutateOptions,
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

type AccountGeneration = { owner: string | undefined; generation: number };
const accounts = new WeakMap<QueryClient, AccountGeneration>();

function currentOwner(client: QueryClient): string | undefined {
  const session = client.getQueryData<{ user?: { id?: string }; session?: { userId?: string } } | null>(queryKeys.auth.session);
  return session === undefined ? undefined : session?.user?.id ?? session?.session?.userId ?? "signed-out";
}

function bindAccount(client: QueryClient): () => boolean {
  let account = accounts.get(client);
  if (!account) {
    account = { owner: currentOwner(client), generation: 0 };
    accounts.set(client, account);
    const tracked = account;
    client.getQueryCache().subscribe(() => {
      const owner = currentOwner(client);
      if (owner !== tracked.owner) {
        tracked.owner = owner;
        tracked.generation += 1;
      }
    });
  }
  const { owner, generation } = account;
  return () => owner !== undefined && account.owner === owner && account.generation === generation;
}

export function useAccountBoundMutation<TData = unknown, TError = DefaultError, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext> & {
    waitForTurn?: (variables: TVariables) => Promise<void> | undefined;
    onFinished?: (variables: TVariables) => void;
  },
): UseMutationResult<TData, TError, TVariables, TContext> {
  const client = useQueryClient();
  type OwnedVariables = { input: TVariables; isCurrentAccount: () => boolean; operation: typeof options };
  const { mutationFn, onMutate, onSuccess, onError, onSettled, waitForTurn, onFinished, ...rest } = options;
  const mutation = useMutation<TData, TError, OwnedVariables, TContext | undefined>({
    ...rest,
    mutationFn: async ({ input, isCurrentAccount, operation }, context) => {
      await operation.waitForTurn?.(input);
      if (!isCurrentAccount()) throw new DOMException("Your account changed. Retry this action from your current account.", "AbortError");
      if (!operation.mutationFn) throw new Error("Missing account-bound mutation function");
      const result = await operation.mutationFn(input, context);
      if (!isCurrentAccount()) throw new DOMException("Your account changed. Retry this action from your current account.", "AbortError");
      return result;
    },
    onMutate: ({ input, isCurrentAccount, operation }, context) => isCurrentAccount() ? operation.onMutate?.(input, context) : undefined,
    onSuccess: (data, { input, isCurrentAccount, operation }, result, context) => isCurrentAccount() ? operation.onSuccess?.(data, input, result as TContext, context) : undefined,
    onError: (error, { input, isCurrentAccount, operation }, result, context) => isCurrentAccount() ? operation.onError?.(error, input, result, context) : undefined,
    onSettled: async (data, error, { input, operation, isCurrentAccount }, result, context) => {
      operation.onFinished?.(input);
      if (isCurrentAccount()) await operation.onSettled?.(data, error, input, result, context);
    },
  });
  const wrapOptions = (callbacks?: MutateOptions<TData, TError, TVariables, TContext>): MutateOptions<TData, TError, OwnedVariables, TContext | undefined> => ({
    onSuccess: (data, { input, isCurrentAccount }, result, context) => { if (isCurrentAccount()) callbacks?.onSuccess?.(data, input, result, context); },
    onError: (error, { input, isCurrentAccount }, result, context) => { if (isCurrentAccount()) callbacks?.onError?.(error, input, result, context); },
    onSettled: (data, error, { input, isCurrentAccount }, result, context) => { if (isCurrentAccount()) callbacks?.onSettled?.(data, error, input, result, context); },
  });
  const mutate = useCallback((input: TVariables, callbacks?: MutateOptions<TData, TError, TVariables, TContext>) => {
    mutation.mutate({ input, isCurrentAccount: bindAccount(client), operation: options }, wrapOptions(callbacks));
  }, [client, mutation.mutate, options]);
  const mutateAsync = useCallback((input: TVariables, callbacks?: MutateOptions<TData, TError, TVariables, TContext>) => {
    return mutation.mutateAsync({ input, isCurrentAccount: bindAccount(client), operation: options }, wrapOptions(callbacks));
  }, [client, mutation.mutateAsync, options]);
  return { ...mutation, variables: mutation.variables?.input, mutate, mutateAsync } as UseMutationResult<TData, TError, TVariables, TContext>;
}
