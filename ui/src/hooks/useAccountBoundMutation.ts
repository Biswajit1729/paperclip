import { useCallback, useContext } from "react";
import {
  useMutation,
  useQueryClient,
  QueryClientContext,
  type DefaultError,
  type MutateOptions,
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
  type MutationFunctionContext,
} from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

type AccountGeneration = { owner: string | undefined; generation: number };
const accounts = new WeakMap<QueryClient, AccountGeneration>();

function currentOwner(client: QueryClient): string | undefined {
  const session = client.getQueryData<{ user?: { id?: string }; session?: { userId?: string } } | null>(queryKeys.auth.session);
  return session === undefined ? undefined : session?.user?.id ?? session?.session?.userId ?? "signed-out";
}

function bindAccount(client: QueryClient) {
  let account = accounts.get(client);
  if (!account) {
    account = { owner: currentOwner(client), generation: 0 };
    accounts.set(client, account);
    const tracked = account;
    client.getQueryCache().subscribe(() => {
      const owner = currentOwner(client);
      if (owner !== tracked.owner) {
        if (tracked.owner !== undefined || tracked.generation !== 0) tracked.generation += 1;
        tracked.owner = owner;
      }
    });
  }
  const { owner, generation } = account;
  const isCurrentAccount = () => account.owner !== undefined && account.generation === generation
    && (owner === undefined ? generation === 0 : account.owner === owner);
  const whenAccountReady = () => {
    if (account.owner !== undefined || account.generation !== generation) return Promise.resolve();
    return new Promise<void>(resolve => {
      const unsubscribe = client.getQueryCache().subscribe(() => {
        if (account.owner !== undefined || account.generation !== generation) {
          unsubscribe();
          resolve();
        }
      });
    });
  };
  return { isCurrentAccount, whenAccountReady };
}

export function useCurrentAccountGuard(): () => boolean {
  const client = useContext(QueryClientContext);
  return client ? bindAccount(client).isCurrentAccount : () => true;
}

type AccountMutationContext = MutationFunctionContext & { assertCurrentAccount: () => void };

export function useAccountBoundMutation<TData = unknown, TError = DefaultError, TVariables = void, TContext = unknown>(
  options: Omit<UseMutationOptions<TData, TError, TVariables, TContext>, "mutationFn"> & {
    mutationFn?: (variables: TVariables, context: AccountMutationContext) => Promise<TData>;
    waitForTurn?: (variables: TVariables) => Promise<void> | undefined;
    onFinished?: (variables: NoInfer<TVariables>, context: NoInfer<TContext> | undefined) => void;
  },
): UseMutationResult<TData, TError, TVariables, TContext> {
  const client = useQueryClient();
  type OwnedVariables = { input: TVariables; operation: typeof options } & ReturnType<typeof bindAccount>;
  const { mutationFn, onMutate, onSuccess, onError, onSettled, waitForTurn, onFinished, ...rest } = options;
  const mutation = useMutation<TData, TError, OwnedVariables, TContext | undefined>({
    ...rest,
    mutationFn: async ({ input, isCurrentAccount, whenAccountReady, operation }, context) => {
      await whenAccountReady();
      await operation.waitForTurn?.(input);
      const assertCurrentAccount = () => {
        if (!isCurrentAccount()) throw new DOMException("Your account changed. Retry this action from your current account.", "AbortError");
      };
      assertCurrentAccount();
      if (!operation.mutationFn) throw new Error("Missing account-bound mutation function");
      const result = await operation.mutationFn(input, { ...context, assertCurrentAccount });
      assertCurrentAccount();
      return result;
    },
    onMutate: async ({ input, isCurrentAccount, whenAccountReady, operation }, context) => {
      await whenAccountReady();
      return isCurrentAccount() ? operation.onMutate?.(input, context) : undefined;
    },
    onSuccess: (data, { input, isCurrentAccount, operation }, result, context) => isCurrentAccount() ? operation.onSuccess?.(data, input, result as TContext, context) : undefined,
    onError: (error, { input, isCurrentAccount, operation }, result, context) => isCurrentAccount() ? operation.onError?.(error, input, result, context) : undefined,
    onSettled: async (data, error, { input, operation, isCurrentAccount }, result, context) => {
      operation.onFinished?.(input, result);
      if (isCurrentAccount()) await operation.onSettled?.(data, error, input, result, context);
    },
  });
  const wrapOptions = (callbacks?: MutateOptions<TData, TError, TVariables, TContext>): MutateOptions<TData, TError, OwnedVariables, TContext | undefined> => ({
    onSuccess: (data, { input, isCurrentAccount }, result, context) => { if (isCurrentAccount()) callbacks?.onSuccess?.(data, input, result, context); },
    onError: (error, { input, isCurrentAccount }, result, context) => { if (isCurrentAccount()) callbacks?.onError?.(error, input, result, context); },
    onSettled: (data, error, { input, isCurrentAccount }, result, context) => { if (isCurrentAccount()) callbacks?.onSettled?.(data, error, input, result, context); },
  });
  const mutate = useCallback((input: TVariables, callbacks?: MutateOptions<TData, TError, TVariables, TContext>) => {
    mutation.mutate({ input, ...bindAccount(client), operation: options }, wrapOptions(callbacks));
  }, [client, mutation.mutate, options]);
  const mutateAsync = useCallback((input: TVariables, callbacks?: MutateOptions<TData, TError, TVariables, TContext>) => {
    return mutation.mutateAsync({ input, ...bindAccount(client), operation: options }, wrapOptions(callbacks));
  }, [client, mutation.mutateAsync, options]);
  return { ...mutation, variables: mutation.variables?.input, mutate, mutateAsync } as UseMutationResult<TData, TError, TVariables, TContext>;
}
