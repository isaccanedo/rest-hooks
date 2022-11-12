---
title: makeCacheProvider()
---

```typescript
declare const makeCacheProvider: (
  managers: Manager[],
  initialState?: State<unknown>,
) => ({ children }: { children: React.ReactNode }) => JSX.Element;
```

Used to build a [<CacheProvider /\>](./CacheProvider.md) for [makeRenderRestHook()](./makeRenderRestHook.md)

## Arguments

### managers

[Manager](./Manager.md)

### initialState

Can be used to prime the cache if test expects cache values to already be filled.

## Returns

Simple wrapper component that only has child as prop.

```tsx
const manager = new MockNetworkManager();
const subscriptionManager = new SubscriptionManager(PollingSubscription);
const Provider = makeCacheProvider([manager, subscriptionManager]);

function renderRestHook<T>(callback: () => T) {
  return renderHook(callback, {
    wrapper: ({ children }) => <Provider>{children}</Provider>,
  });
}
```
