// node:async_hooks as workerd has it (nodejs_compat): the part lib/errors.ts uses.
declare module "node:async_hooks" {
  export class AsyncLocalStorage<T> {
    run<R>(store: T, callback: () => R): R;
    getStore(): T | undefined;
  }
}
