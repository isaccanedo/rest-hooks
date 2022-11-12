import {
  CoolerArticleResource,
  ArticleResource,
  PaginatedArticleResource,
  UserResource,
  ArticleResourceWithOtherListUrl,
  ListPaginatedArticle,
  CoolerArticleDetail,
  IndexedUserResource,
} from '__tests__/legacy-3';
import nock from 'nock';
import { act } from '@testing-library/react-hooks';
import { jest } from '@jest/globals';
// relative imports to avoid circular dependency in tsconfig references
import { SimpleRecord } from '@rest-hooks/legacy';

import {
  makeRenderRestHook,
  makeCacheProvider,
  makeExternalCacheProvider,
} from '../../../../test';
import { useResource, useFetcher, useCache, useInvalidator } from '../hooks';
import {
  payload,
  createPayload,
  users,
  nested,
  paginatedFirstPage,
  paginatedSecondPage,
} from '../test-fixtures';

function onError(e: any) {
  e.preventDefault();
}
beforeEach(() => {
  if (typeof addEventListener === 'function')
    addEventListener('error', onError);
});
afterEach(() => {
  if (typeof removeEventListener === 'function')
    removeEventListener('error', onError);
});

describe.each([
  ['CacheProvider', makeCacheProvider],
  ['ExternalCacheProvider', makeExternalCacheProvider],
] as const)(`%s`, (_, makeProvider) => {
  // TODO: add nested resource test case that has multiple partials to test merge functionality

  let renderRestHook: ReturnType<typeof makeRenderRestHook>;
  let mynock: nock.Scope;

  beforeEach(() => {
    nock(/.*/)
      .persist()
      .defaultReplyHeaders({
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      })
      .options(/.*/)
      .reply(200)
      .get(`/article-cooler/${payload.id}`)
      .reply(200, payload)
      .delete(`/article-cooler/${payload.id}`)
      .reply(204, '')
      .delete(`/article/${payload.id}`)
      .reply(200, {})
      .get(`/article-cooler/0`)
      .reply(403, {})
      .get(`/article-cooler/666`)
      .reply(200, '')
      .get(`/article-cooler/`)
      .reply(200, nested)
      .post(`/article-cooler/`)
      .reply(200, createPayload)
      .get(`/user/`)
      .reply(200, users);
    mynock = nock(/.*/).defaultReplyHeaders({
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  beforeEach(() => {
    renderRestHook = makeRenderRestHook(makeProvider);
  });

  describe('Endpoint', () => {
    it('should resolve await', async () => {
      const result = await CoolerArticleDetail(payload);
      expect(result.title).toBe(payload.title);
      // @ts-expect-error
      expect(result.lafsjlfd).toBeUndefined();
    });

    it('should resolve useResource()', async () => {
      const { result, waitForNextUpdate } = renderRestHook(() => {
        return useResource(CoolerArticleDetail, payload);
      });
      expect(result.current).toBeUndefined();
      await waitForNextUpdate();
      expect(result.current.title).toBe(payload.title);
      // @ts-expect-error
      expect(result.current.lafsjlfd).toBeUndefined();
    });

    it('should resolve useResource() with SimpleRecords', async () => {
      mynock.get(`/article-paginated/`).reply(200, paginatedFirstPage);

      const { result, waitForNextUpdate } = renderRestHook(() => {
        return useResource(ListPaginatedArticle, {});
      });
      expect(result.current).toBeUndefined();
      await waitForNextUpdate();
      expect(result.current).toBeInstanceOf(SimpleRecord);
      expect(result.current.nextPage).toBe('');
      expect(result.current.prevPage).toBe('');
      expect(result.current.results).toMatchSnapshot();
      // @ts-expect-error
      expect(result.current.lafsjlfd).toBeUndefined();
    });
  });

  it('should resolve useResource()', async () => {
    const { result, waitForNextUpdate } = renderRestHook(() => {
      return useResource(CoolerArticleResource.detailShape(), payload);
    });
    expect(result.current).toBeUndefined();
    await waitForNextUpdate();
    expect(result.current instanceof CoolerArticleResource).toBe(true);
    expect(result.current.title).toBe(payload.title);
  });

  it('should resolve useResource() with SimpleRecords', async () => {
    mynock.get(`/article-paginated/`).reply(200, paginatedFirstPage);

    const { result, waitForNextUpdate } = renderRestHook(() => {
      return useResource(PaginatedArticleResource.listDefaultsShape(), {});
    });
    expect(result.current).toBeUndefined();
    await waitForNextUpdate();
    expect(result.current).toBeInstanceOf(SimpleRecord);
    expect(result.current.nextPage).toBe('');
    expect(result.current.prevPage).toBe('');
    expect(result.current.results).toMatchSnapshot();
  });

  it('should suspend once deleted', async () => {
    const temppayload = {
      ...payload,
      id: 1234,
    };
    mynock
      .get(`/article-cooler/${temppayload.id}`)
      .reply(200, temppayload)
      .delete(`/article-cooler/${temppayload.id}`)
      .reply(204, '');
    const throws: Promise<any>[] = [];
    const { result, waitForNextUpdate } = renderRestHook(() => {
      try {
        return [
          useResource(CoolerArticleResource.detailShape(), {
            id: temppayload.id,
          }),
          useFetcher(CoolerArticleResource.deleteShape()),
        ] as const;
      } catch (e: any) {
        if (typeof e.then === 'function') {
          if (e !== throws[throws.length - 1]) {
            throws.push(e);
          }
        }
        throw e;
      }
    });
    expect(result.current).toBeUndefined();
    await waitForNextUpdate();
    let [data, del] = result.current;
    expect(data).toBeInstanceOf(CoolerArticleResource);
    expect(data.title).toBe(temppayload.title);
    expect(throws.length).toBe(1);

    mynock
      .persist()
      .get(`/article-cooler/${temppayload.id}`)
      .reply(200, { ...temppayload, title: 'othertitle' });

    await act(async () => {
      await del({ id: temppayload.id });
    });
    //expect(throws.length).toBe(2);   TODO: delete seems to have receive process multiple times. we suspect this is because of test+act integration.
    await waitForNextUpdate();
    await throws[throws.length - 1];
    [data, del] = result.current;
    expect(data).toBeInstanceOf(CoolerArticleResource);
    expect(data.title).toBe('othertitle');
  });

  it('should suspend once invalidated', async () => {
    const temppayload = {
      ...payload,
      id: 1234,
    };
    mynock
      .get(`/article-cooler/${temppayload.id}`)
      .reply(200, temppayload)
      .delete(`/article-cooler/${temppayload.id}`)
      .reply(204, '');
    const throws: Promise<any>[] = [];
    const { result, waitForNextUpdate } = renderRestHook(() => {
      try {
        return [
          useResource(CoolerArticleResource.detailShape(), {
            id: temppayload.id,
          }),
          useInvalidator(CoolerArticleResource.detailShape()),
        ] as const;
      } catch (e: any) {
        if (typeof e.then === 'function') {
          if (e !== throws[throws.length - 1]) {
            throws.push(e);
          }
        }
        throw e;
      }
    });
    expect(result.current).toBeUndefined();
    await waitForNextUpdate();
    let [data, invalidate] = result.current;
    expect(data).toBeInstanceOf(CoolerArticleResource);
    expect(data.title).toBe(temppayload.title);
    expect(throws.length).toBe(1);

    mynock
      .persist()
      .get(`/article-cooler/${temppayload.id}`)
      .reply(200, { ...temppayload, title: 'othertitle' });
    act(() => {
      invalidate({ id: temppayload.id });
    });
    expect(throws.length).toBe(2);
    await waitForNextUpdate();
    [data, invalidate] = result.current;
    expect(data).toBeInstanceOf(CoolerArticleResource);
    expect(data.title).toBe('othertitle');
  });

  it('should throw when retrieving an empty string', async () => {
    const { result } = renderRestHook(() => {
      return useFetcher(CoolerArticleResource.detailShape());
    });

    await expect(result.current({ id: 666 })).rejects.toThrowError(
      'Unexpected end of JSON input',
    );
  });

  it('should not throw on delete', async () => {
    const { result } = renderRestHook(() => {
      return [
        useFetcher(CoolerArticleResource.deleteShape()),
        useFetcher(ArticleResource.deleteShape()),
      ];
    });

    for (const del of result.current) {
      await expect(del(payload)).resolves.toBeDefined();
    }
  });

  it('useResource() should throw errors on bad network', async () => {
    const { result, waitForNextUpdate } = renderRestHook(() => {
      return useResource(CoolerArticleResource.detailShape(), {
        title: '0',
      });
    });
    expect(result.current).toBeUndefined();
    await waitForNextUpdate();
    expect(result.error).toBeDefined();
    expect((result.error as any).status).toBe(403);
  });

  it('useResource() should throw errors on bad network (multiarg)', async () => {
    const { result, waitForNextUpdate } = renderRestHook(() => {
      return useResource([
        CoolerArticleResource.detailShape(),
        {
          title: '0',
        },
      ]);
    });
    expect(result.current).toBeUndefined();
    await waitForNextUpdate();
    expect(result.error).toBeDefined();
    expect((result.error as any).status).toBe(403);
  });

  it('useResource() should throw errors on malformed response', async () => {
    const response = [1];
    mynock.get(`/article-cooler/${878}`).reply(200, response);
    const { result, waitForNextUpdate } = renderRestHook(() => {
      return useResource(CoolerArticleResource.detailShape(), {
        id: 878,
      });
    });
    expect(result.current).toBeUndefined();
    await waitForNextUpdate();
    expect(result.error).toBeDefined();
    expect((result.error as any).status).toBe(400);
    expect(result.error).toMatchSnapshot();
  });

  it('should resolve parallel useResource() request', async () => {
    const { result, waitForNextUpdate } = renderRestHook(() => {
      return useResource(
        [
          CoolerArticleResource.detailShape(),
          {
            id: payload.id,
          },
        ],
        [UserResource.listShape(), {}],
      );
    });
    expect(result.current).toBeUndefined();
    await waitForNextUpdate();
    const [article, users] = result.current;
    expect(article instanceof CoolerArticleResource).toBe(true);
    expect(article.title).toBe(payload.title);
    expect(users).toBeDefined();
    expect(users.length).toBeTruthy();
    expect(users[0] instanceof UserResource).toBe(true);
  });

  it('should not suspend with no params to useResource()', () => {
    let article: any;
    const { result } = renderRestHook(() => {
      article = useResource(CoolerArticleResource.detailShape(), null);
      return 'done';
    });
    expect(result.current).toBe('done');
    expect(article).toBeUndefined();
  });

  it('should update on create', async () => {
    const { result, waitForNextUpdate } = renderRestHook(() => {
      const articles = useResource(CoolerArticleResource.listShape(), {});
      const createNewArticle = useFetcher(CoolerArticleResource.createShape());
      return { articles, createNewArticle };
    });
    await waitForNextUpdate();
    await result.current.createNewArticle({}, { id: 1 }, [
      [
        CoolerArticleResource.listShape(),
        {},
        (newArticle: string, articles: string[]): string[] => [
          ...articles,
          newArticle,
        ],
      ],
    ]);
    expect(
      result.current.articles.map(
        ({ id }: Partial<CoolerArticleResource>) => id,
      ),
    ).toEqual([5, 3, 1]);
  });

  it('should update on get for a paginated resource', async () => {
    mynock.get(`/article-paginated/`).reply(200, paginatedFirstPage);
    mynock.get(`/article-paginated/?cursor=2`).reply(200, paginatedSecondPage);

    const { result, waitForNextUpdate } = renderRestHook(() => {
      const { results: articles } = useResource(
        PaginatedArticleResource.listShape(),
        {},
      );
      const getNextPage = useFetcher(PaginatedArticleResource.listShape());
      return { articles, getNextPage };
    });
    await waitForNextUpdate();
    await result.current.getNextPage({ cursor: 2 }, undefined, [
      [
        PaginatedArticleResource.listShape(),
        {},
        (
          newArticles: { results: string[] },
          articles: { results?: string[] },
        ) => ({
          results: [...(articles.results || []), ...newArticles.results],
        }),
      ],
    ]);
    expect(
      result.current.articles.map(
        ({ id }: Partial<PaginatedArticleResource>) => id,
      ),
    ).toEqual([5, 3, 7, 8]);
  });

  describe('Optimistic Updates', () => {
    it('works with partial update', async () => {
      const params = { id: payload.id };
      mynock.patch('/article-cooler/5').reply(200, {
        ...payload,
        title: 'some other title',
        content: 'real response',
      });

      const { result, waitForNextUpdate } = renderRestHook(
        () => {
          const put = useFetcher(CoolerArticleResource.partialUpdateShape());
          const article = useCache(CoolerArticleResource.detailShape(), params);
          // @ts-expect-error
          article.doesnotexist;
          return { put, article };
        },
        {
          results: [
            {
              request: CoolerArticleResource.detailShape(),
              params,
              result: payload,
            },
          ],
        },
      );
      expect(result.current.article).toEqual(
        CoolerArticleResource.fromJS(payload),
      );
      const promise = result.current.put(params, { content: 'changed' });
      expect(result.current.article).toBeInstanceOf(CoolerArticleResource);
      expect(result.current.article).toEqual(
        CoolerArticleResource.fromJS({
          ...payload,
          content: 'changed',
        }),
      );
      await promise;
      expect(result.current.article).toEqual(
        CoolerArticleResource.fromJS({
          ...payload,
          title: 'some other title',
          content: 'real response',
        }),
      );
    });

    it('works with deletes', async () => {
      const params = { id: payload.id };
      mynock.delete('/article-cooler/5').reply(200, '');

      const { result } = renderRestHook(
        () => {
          const del = useFetcher(CoolerArticleResource.deleteShape());
          const articles = useCache(CoolerArticleResource.listShape(), {});
          return { del, articles };
        },
        {
          results: [
            {
              request: CoolerArticleResource.listShape(),
              params: {},
              result: [payload],
            },
          ],
        },
      );
      expect(result.current.articles).toEqual([
        CoolerArticleResource.fromJS(payload),
      ]);
      const promise = act(async () => {
        await result.current.del(params);
      });
      expect(result.current.articles).toEqual([]);
      await promise;
      expect(result.current.articles).toEqual([]);
    });

    it('works with eager creates', async () => {
      const body = { id: -1111111111, content: 'hi' };
      const existingItem = ArticleResourceWithOtherListUrl.fromJS({
        id: 100,
        content: 'something',
      });

      mynock.post(`/article/`).reply(201, {
        ...payload,
        title: 'some other title',
        content: 'real response',
      });

      const { result, waitForNextUpdate } = renderRestHook(
        () => {
          const create = useFetcher(
            ArticleResourceWithOtherListUrl.createShape(),
          );
          const listA = useCache(
            ArticleResourceWithOtherListUrl.listShape(),
            {},
          );
          const listB = useCache(
            ArticleResourceWithOtherListUrl.otherListShape(),
            {},
          );
          return { create, listA, listB };
        },
        {
          results: [
            {
              request: ArticleResourceWithOtherListUrl.otherListShape(),
              params: {},
              result: [{ id: 100, content: 'something' }],
            },
          ],
        },
      );

      expect(result.current.listA).toEqual(undefined);
      expect(result.current.listB).toEqual([existingItem]);

      const promise = result.current.create({}, body, [
        [
          ArticleResourceWithOtherListUrl.listShape(),
          {},
          (newArticleID: string, articleIDs: string[] | undefined) => [
            ...(articleIDs || []),
            newArticleID,
          ],
        ],
        [
          ArticleResourceWithOtherListUrl.otherListShape(),
          {},
          (newArticleID: string, articleIDs: string[] | undefined) => [
            ...(articleIDs || []),
            newArticleID,
          ],
        ],
      ]);

      expect(result.current.listA).toEqual([
        CoolerArticleResource.fromJS(body),
      ]);
      expect(result.current.listB).toEqual([
        existingItem,
        CoolerArticleResource.fromJS(body),
      ]);
      await promise;
      expect(result.current.listA).toEqual([
        CoolerArticleResource.fromJS({
          ...payload,
          title: 'some other title',
          content: 'real response',
        }),
      ]);
      expect(result.current.listB).toEqual([
        existingItem,
        CoolerArticleResource.fromJS({
          ...payload,
          title: 'some other title',
          content: 'real response',
        }),
      ]);
    });

    it('should clear only earlier optimistic updates when a promise resolves', async () => {
      jest.useFakeTimers({ legacyFakeTimers: true });

      const params = { id: payload.id };
      const { result, waitForNextUpdate } = renderRestHook(
        () => {
          const put = useFetcher(CoolerArticleResource.partialUpdateShape());
          const article = useCache(CoolerArticleResource.detailShape(), params);
          return { put, article };
        },
        {
          results: [
            {
              request: CoolerArticleResource.detailShape(),
              params,
              result: payload,
            },
          ],
        },
      );

      // first optimistic
      mynock
        .patch('/article-cooler/5')
        .delay(200)
        .reply(200, {
          ...payload,
          title: 'first',
          content: 'first',
        });
      result.current.put(params, {
        title: 'firstoptimistic',
        content: 'firstoptimistic',
      });
      expect(result.current.article).toEqual(
        CoolerArticleResource.fromJS({
          ...payload,
          title: 'firstoptimistic',
          content: 'firstoptimistic',
        }),
      );

      // second optimistic
      mynock
        .patch('/article-cooler/5')
        .delay(50)
        .reply(200, {
          ...payload,
          title: 'second',
        });
      result.current.put(params, {
        title: 'secondoptimistic',
      });
      expect(result.current.article).toEqual(
        CoolerArticleResource.fromJS({
          ...payload,
          title: 'secondoptimistic',
          content: 'firstoptimistic',
        }),
      );

      // second optimistic
      mynock
        .patch('/article-cooler/5')
        .delay(500)
        .reply(200, {
          ...payload,
          tags: ['third'],
        });
      result.current.put(params, {
        tags: ['thirdoptimistic'],
      });
      expect(result.current.article).toEqual(
        CoolerArticleResource.fromJS({
          ...payload,
          title: 'secondoptimistic',
          content: 'firstoptimistic',
          tags: ['thirdoptimistic'],
        }),
      );

      // resolve second request while first is in flight
      jest.advanceTimersByTime(51);
      await waitForNextUpdate();

      // first and second optimistic should be cleared with only third optimistic left to be layerd
      // on top of second's network response
      expect(result.current.article).toEqual(
        CoolerArticleResource.fromJS({
          ...payload,
          title: 'second',
        }),
      );
      jest.useRealTimers();
    });

    describe('indexes', () => {
      it('should resolve parallel useResource() request', async () => {
        const { result, waitForNextUpdate } = renderRestHook(() => {
          useResource(IndexedUserResource.listShape(), {});
          return {
            bob: useCache(IndexedUserResource.indexShape(), {
              username: 'bob',
            }),
            charlie: useCache(IndexedUserResource.indexShape(), {
              username: 'charlie',
            }),
            fetch: useFetcher(IndexedUserResource.detailShape()),
          };
        });
        expect(result.current).toBeUndefined();
        await waitForNextUpdate();
        const bob = result.current.bob;
        expect(bob).toBeDefined();
        expect(bob instanceof UserResource).toBe(true);
        expect(bob?.username).toBe('bob');
        expect(bob).toMatchSnapshot();
        expect(result.current.charlie).toBeUndefined();

        const renamed = { ...users[0] };
        renamed.username = 'charlie';
        mynock.get(`/user/23`).reply(200, renamed);
        result.current.fetch({ id: '23' });
        await waitForNextUpdate();

        const charlie = result.current.charlie;
        expect(charlie).toBeDefined();
        expect(charlie instanceof UserResource).toBe(true);
        expect(charlie?.username).toBe('charlie');
        expect(charlie).toMatchSnapshot();
        expect(result.current.bob).toBeUndefined();
      });
    });
  });
});
