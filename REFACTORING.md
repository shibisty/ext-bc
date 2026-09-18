# Bookmark Status Checker — план рефакторинга, тестов и сборки на TypeScript

Документ описывает предлагаемые изменения. Разбит на 4 части:

1. Баги, найденные в текущем коде (чинить независимо от рефакторинга)
2. Рефакторинг: целевая структура модулей
3. Тесты
4. Сборка на TypeScript

---

## 1. Баги и проблемы в текущем коде

### 1.1 Stale-lock никогда не срабатывает (background.js)

```js
// getState() не читает checkingSince из storage:
const data = await api.storage.local.get([... "checking"]);   // нет "checkingSince"
...
// но checkNextBookmark на него полагается:
const stuckTooLong = already.checking && already.checkingSince && ...
```

`already.checkingSince` всегда `undefined` → `stuckTooLong` всегда `false`. Если воркер
умрёт между `setState({checking:true})` и снятием флага, проверки встанут навсегда.

**Фикс:** добавить `checkingSince` в список ключей `getState()` (в целевой структуре —
единый `STATE_KEYS`, см. §2.2).

### 1.2 Куки пользователя уходят на все сайты из закладок

```js
res = await fetch(url, { method: "HEAD", redirect: "follow", ... });
```

Без `credentials` fetch из расширения с `host_permissions: ["<all_urls>"]` идёт
с cookies пользователя. То есть каждый час расширение делает аутентифицированный
запрос ко всем сайтам в закладках. Это и приватность, и искажение статуса
(залогиненный `200` против анонимного `403`).

**Фикс:** `credentials: "omit"`. Заодно `referrerPolicy: "no-referrer"`.

### 1.3 Хардкод русских строк в background.js

```js
return { status: "TIMEOUT", statusText: "Таймаут" };
return { status: "ERR", statusText: "Нет соединения" };
...
items[id].statusText = "Domain unreachable";   // а здесь уже английский
```

При 53 локалях в `_locales/` в storage пишутся русско-английские строки.

**Фикс:** в storage хранить только машинный код (`"TIMEOUT" | "ERR" | number`) и
опционально `reason: "domain" | "network" | "timeout"`. Человекочитаемый текст —
только в popup через `t()`.

### 1.4 `propagateDomainStatus` помечает домен по одной неудаче

Одна сетевая ошибка (например, кратковременный обрыв Wi-Fi) переводит все закладки
домена в `ERR` с `checkedAt = now`, то есть они получают вид «свежепроверенных»,
хотя не проверялись. Плюс перебор всех items и `new URL()` на каждой — O(n) с
парсингом на каждую проверку.

**Фикс:** кешировать hostname в item при синхронизации (`item.host`), а распространение
статуса делать флагом `inferredFrom: sourceId` без перезаписи `checkedAt`, чтобы UI мог
показывать «предположительно недоступен» и такие записи перепроверялись в обычном порядке.

### 1.5 `checkSpecificBookmark` игнорирует блокировку `checking`

Ручная проверка из контекстного меню может выполниться параллельно с фоновой и
перезаписать `items` целиком (read-modify-write без merge) — результат фоновой проверки
теряется.

**Фикс:** общий мьютекс (одна очередь промисов) для всех путей записи `items`.

### 1.6 `render()` перерисовывает всё дерево на каждое изменение storage

```js
api.storage.onChanged.addListener(async (changes, area) => { ... render(state); });
```

Фон проверяет по одной закладке раз в N минут, но каждая запись `items` рвёт весь DOM:
теряется позиция скролла, ломается ленивая подгрузка (`IntersectionObserver` пересоздаётся),
подписки навешиваются заново на каждую из N строк. При 2000 закладок это заметно.

**Фикс:** диффить `changes.items.oldValue/newValue`, обновлять только изменившиеся строки
(`badge.textContent`, `badge.className`, `.row-url`). Полный `render()` — только при
изменении `tree`/`order`/`pinned`.

### 1.7 Обработчики событий на каждой строке

`makeRow` вешает 6 слушателей на строку + 5 на drag → ~11 × N. При 2000 закладок это
22 000 замыканий.

**Фикс:** делегирование на `#list` — один набор слушателей, `id` берётся из
`e.target.closest("[data-id]").dataset.id`.

### 1.8 `loadMessageDicts()` — 220 строк и загрузка 53 локалей ради одной

Функция занимает 18% файла, грузит все `_locales/*/messages.json` (≈230 КБ) даже когда
пользователю нужна одна, а в `catch` вручную обнуляет 53 поля. Плюс блок присваиваний
написан через запятую (`messageDicts.ar = await arRes.json(),` …) — это одно выражение
с оператором «запятая», работает случайно.

Ещё: `let messageDicts = { en: null, ru: null }` — инициализация из старой версии,
остальные ключи появляются динамически.

**Фикс — весь блок сжимается до:**

```ts
const LOCALES = [
  "am","ar","bg","bn","ca","cs","da","de","el","en","en_GB","en_US","es","es_419",
  "et","fa","fi","fil","fr","gu","he","hi","hr","hu","id","it","ja","kn","ko","lt",
  "lv","ml","mr","ms","nl","no","pl","pt_BR","pt_PT","ro","ru","sk","sl","sr","sv",
  "sw","ta","te","th","tr","uk","vi","zh_CN","zh_TW",
] as const;

export type Locale = (typeof LOCALES)[number];

const dicts = new Map<Locale, MessageDict>();

export async function loadLocale(locale: Locale): Promise<void> {
  if (dicts.has(locale)) return;
  try {
    const res = await fetch(api.runtime.getURL(`_locales/${locale}/messages.json`));
    dicts.set(locale, await res.json());
  } catch {
    // остаёмся на api.i18n.getMessage()
  }
}
```

220 строк → 20, сеть — 4 КБ вместо 230 КБ.

### 1.9 Прочее по мелочи

| Место | Проблема |
|---|---|
| `popup.html` / `sidepanel.html` | 129 строк, отличаются одним `class="side-panel-mode"` на `<body>` — дублирование, которое разъедется при первой же правке. Генерировать второй файл из первого на сборке. |
| `chrome/manifest.json`, `firefox/manifest.json` | `version`, `name`, `description`, `icons`, `action` продублированы. Версию придётся править в двух местах. Генерировать оба из `manifest.config.ts` + `package.json`. |
| `build.sh` / `build.bat` / `firefox.py` | Одна и та же логика в трёх реализациях; `firefox.py` существует, потому что `Compress-Archive` из `build.bat` кладёт бэкслеши в пути и AMO такой zip не принимает. Один `scripts/build.mjs` решает всё. |
| `popup.js:18,19,23,1035,1115-1117,1180-1194` | Закомментированный мёртвый код — под git не нужен. |
| `badgeText(status)` в поиске | Поиск по `"time"` находит все таймауты, но по `"timeout"` — ничего. Искать по обоим представлениям. |
| `fav.onerror = ...` | Единственное присваивание `on*` в файле, остальное — `addEventListener`. |
| `confirm()` в `bulkDelete` | Блокирующий системный диалог; в side panel выглядит чужеродно. Свой `<dialog>` даст консистентный UI и тестируемость. |
| `appendItemsLazily` | `IntersectionObserver` не отключается при перерисовке списка → утечка наблюдателей между рендерами. |
| `.gitignore` | Только `dist` — нужно `node_modules`, `*.zip`, `.DS_Store`. |

---

## 2. Рефакторинг: целевая структура

Главная проблема — `popup.js` на 1253 строки, где перемешаны i18n, доступ к storage,
DOM-рендер, drag & drop, контекстное меню, выделение, настройки и бутстрап. Плюс
логика очереди проверки написана трижды: `buildQueue()` в background и два инлайн-копипаста
в `updateFooterText()` и `render()`. Три копии уже разошлись: в background учитывается
`disabledChecks`, а критерии сортировки повторены дословно.

### 2.1 Дерево файлов

```
src/
  manifest.config.ts        # один источник манифестов для обоих браузеров
  shared/
    api.ts                  # кросс-браузерный шим + типы
    types.ts                # State, Item, BookmarkNode, Message — общие для обеих сторон
    storage.ts              # STATE_KEYS, DEFAULTS, readState(), writeState()
    queue.ts                # buildQueue() — единственная копия
    status.ts               # badgeClass(), badgeText(), классификация статусов
    url.ts                  # extractHostname(), faviconUrl(), matchesCurrentPage()
    i18n.ts                 # t(), loadLocale(), substitutePlaceholders()
    time.ts                 # timeAgo()
    messages.ts             # типы сообщений popup <-> background + sendMessage()
  background/
    index.ts                # точка входа: только регистрация слушателей
    bookmarks.ts            # processNode(), syncBookmarks(), reconcileItems()
    checker.ts              # checkUrl(), checkNext(), checkOne(), мьютекс
    domain.ts               # propagateDomainStatus()
    alarms.ts               # setupAlarm()
    router.ts               # onMessage -> обработчики (таблица вместо if/else-цепочки)
  popup/
    index.ts                # bootstrap
    dom.ts                  # все getElementById в одном объекте с проверкой на null
    state.ts                # локальное UI-состояние (selection, collapsed, dragging)
    render/
      list.ts               # render(state)
      row.ts                # makeRow()
      tree.ts               # renderTreeNode(), flattenTreeWithPath()
      skeleton.ts
      lazy.ts               # appendItemsLazily() + очистка observer'ов
    selection.ts
    dnd.ts
    context-menu.ts
    settings.ts
  ui/
    popup.html              # sidepanel.html генерируется из него
    popup.css
  _locales/
  icons/
```

### 2.2 Единая схема состояния (`shared/types.ts` + `shared/storage.ts`)

Сейчас схема продублирована: `getState()` в background.js:15-41 и `readStateDirect()`
в popup.js:318-342 — одинаковые списки ключей и дефолтов, причём `DEFAULT_INTERVAL_MINUTES`
константа в одном файле и магическое `60` в другом (в popup их два — в `readStateDirect`
и в `refresh()`). И `checkingSince` из этого списка уже выпал (§1.1).

```ts
// shared/types.ts
export type Status = number | "ERR" | "TIMEOUT" | null;

export interface Item {
  title: string;
  url: string;
  host: string | null;      // кешируем, чтобы не парсить URL на каждой проверке
  status: Status;
  statusText: string | null;
  checkedAt: number | null;
  inferredFrom?: string;    // статус унаследован от другой закладки того же домена
}

export interface BookmarkNode { id: string; title: string; type: "folder"; children: TreeNode[] }
export interface LeafNode     { id: string; title: string; url: string; type: "bookmark" }
export type TreeNode = BookmarkNode | LeafNode;

export interface State {
  tree: TreeNode[];
  order: string[];
  items: Record<string, Item>;
  pinned: string[];
  disabledChecks: string[];
  currentIndex: number;
  intervalMinutes: number;
  lastCheck: number | null;
  checking: boolean;
  checkingSince: number | null;
}
```

```ts
// shared/storage.ts
export const DEFAULT_INTERVAL_MINUTES = 60;

export const DEFAULTS: State = {
  tree: [], order: [], items: {}, pinned: [], disabledChecks: [],
  currentIndex: 0, intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  lastCheck: null, checking: false, checkingSince: null,
};

const KEYS = Object.keys(DEFAULTS) as (keyof State)[];

export async function readState(): Promise<State> {
  const raw = await api.storage.local.get(KEYS);
  return { ...DEFAULTS, ...stripNullish(raw) } as State;
}

export const writeState = (patch: Partial<State>) => api.storage.local.set(patch);
```

Добавление поля в состояние становится правкой одного места, а не четырёх.

### 2.3 Router вместо цепочки if/else

`api.runtime.onMessage` в background.js:316-382 — 66 строк `else if` по `msg.type`,
у каждой ветки одинаковый хвост `sendResponse({ ok: true, state: await getState() })`.

```ts
// shared/messages.ts — типы, общие для обеих сторон
export type Message =
  | { type: "SYNC" }
  | { type: "CHECK_NOW" }
  | { type: "GET_STATE" }
  | { type: "SET_INTERVAL"; minutes: number }
  | { type: "RESET_INDEX" }
  | { type: "TOGGLE_PIN"; id: string }
  | { type: "TOGGLE_DISABLE_CHECK"; id: string }
  | { type: "CHECK_ONE"; id: string }
  | { type: "DELETE"; id: string }
  | { type: "DELETE_MANY"; ids: string[] }
  | { type: "MOVE_BOOKMARKS"; ids: string[]; targetId: string; position: DropPosition };

export const sendMessage = <M extends Message>(msg: M) =>
  api.runtime.sendMessage(msg) as Promise<{ ok: boolean; state: State }>;
```

```ts
// background/router.ts
type Handler<T extends Message> = (msg: T) => Promise<void>;

const handlers: { [K in Message["type"]]: Handler<Extract<Message, { type: K }>> } = {
  SYNC:                 () => void syncBookmarks(),
  CHECK_NOW:            () => checkNext(),
  GET_STATE:            async () => {},
  SET_INTERVAL:         async (m) => { await writeState({ intervalMinutes: m.minutes }); await setupAlarm(); },
  RESET_INDEX:          () => writeState({ currentIndex: 0 }),
  TOGGLE_PIN:           (m) => toggleInList("pinned", m.id),
  TOGGLE_DISABLE_CHECK: (m) => toggleInList("disabledChecks", m.id),
  CHECK_ONE:            (m) => checkOne(m.id),
  DELETE:               (m) => removeBookmarks([m.id]),
  DELETE_MANY:          (m) => removeBookmarks(m.ids),
  MOVE_BOOKMARKS:       (m) => moveBookmarksTo(m.ids, m.targetId, m.position),
};

api.runtime.onMessage.addListener((msg: Message, _s, sendResponse) => {
  (async () => {
    await handlers[msg.type](msg as never);
    sendResponse({ ok: true, state: await readState() });
  })().catch(() => sendResponse({ ok: false }));
  return true;
});
```

66 строк → 20, а TypeScript начинает ловить опечатки в `msg.type` и отсутствующие поля
на обеих сторонах — сейчас `sendMessage({ type: "TOGGL_PIN", id })` молча ничего не делает,
`sendResponse` не вызывается, и popup виснет на await навсегда.

Обратите внимание на текущий `TOGGLE_PIN` / `TOGGLE_DISABLE_CHECK` — это один и тот же
код с точностью до имени поля и `unshift` против `push`; отсюда `toggleInList()`.

### 2.4 Чистые функции = ядро для тестов

Вынести из DOM-кода всё, что не трогает DOM. Тогда 80% логики покрывается тестами
без jsdom и без моков браузера:

- `buildQueue(order, pinned, disabled)`
- `badgeClass(status)`, `badgeText(status)`
- `matchesCurrentPage(bookmarkUrl, tabInfo)`
- `extractHostname(url)`, `faviconUrl(url)`
- `timeAgo(ts, now)` ← добавить параметр `now`, сейчас функция зависит от `Date.now()` и нетестируема
- `substitutePlaceholders(str, subs)`
- `flattenTreeWithPath(nodes)`
- `reconcileItems(prevItems, flatBookmarks)` — вычленить из `syncBookmarks()` (background.js:71-95)
- `nextIndex(currentIndex, queueLength)`
- `filterBySearch(order, items, query)` — вынуть из `render()`

---

## 3. Тесты

**Стек:** Vitest + jsdom + `@types/chrome`. Vitest берём вместо Jest: нативный ESM/TS
без Babel, тот же esbuild, что и в сборке.

```
tests/
  setup.ts                # регистрирует глобальный мок chrome.*
  mocks/browser.ts        # in-memory реализация storage/bookmarks/alarms/runtime/i18n
  unit/
    queue.test.ts
    status.test.ts
    url.test.ts
    time.test.ts
    i18n.test.ts
    bookmarks.test.ts     # processNode / reconcileItems
  integration/
    checker.test.ts       # checkUrl с замоканным fetch, мьютекс, stale-lock
    router.test.ts        # сообщения popup -> background
    render.test.ts        # jsdom: рендер дерева, поиск, выделение
```

### Мок браузерного API

Самое ценное — in-memory storage, потому что почти вся логика крутится вокруг него:

```ts
// tests/mocks/browser.ts
export function createBrowserMock() {
  let store: Record<string, unknown> = {};
  const listeners: ((c: unknown, a: string) => void)[] = [];

  return {
    storage: {
      local: {
        get: async (keys: string[]) =>
          Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]])),
        set: async (patch: Record<string, unknown>) => {
          const changes = Object.fromEntries(
            Object.entries(patch).map(([k, v]) => [k, { oldValue: store[k], newValue: v }]),
          );
          store = { ...store, ...patch };
          listeners.forEach((l) => l(changes, "local"));
        },
      },
      onChanged: { addListener: (l: never) => listeners.push(l) },
    },
    bookmarks: { /* getTree, get, getChildren, move, remove, on* */ },
    alarms:    { create: vi.fn(), clear: vi.fn(), onAlarm: { addListener: vi.fn() } },
    runtime:   { sendMessage: vi.fn(), getURL: (p: string) => `/${p}`, getManifest: () => ({ version: "1.5.7" }) },
    i18n:      { getMessage: (k: string) => k, getUILanguage: () => "en-US" },
    __reset:   () => { store = {}; },
  };
}
```

### Примеры тестов на найденные баги

```ts
// tests/unit/queue.test.ts
describe("buildQueue", () => {
  it("ставит закреплённые в начало, сохраняя их порядок", () => {
    expect(buildQueue(["a", "b", "c", "d"], ["c", "a"], [])).toEqual(["c", "a", "b", "d"]);
  });

  it("исключает закладки с отключённой проверкой, включая закреплённые", () => {
    expect(buildQueue(["a", "b", "c"], ["c"], ["c", "b"])).toEqual(["a"]);
  });

  it("возвращает пустую очередь, когда отключены все", () => {
    expect(buildQueue(["a", "b"], [], ["a", "b"])).toEqual([]);
  });
});
```

```ts
// tests/integration/checker.test.ts
it("перехватывает зависшую блокировку старше CHECKING_STALE_MS", async () => {
  // регрессия на §1.1: checkingSince не читался из storage
  await writeState({ checking: true, checkingSince: Date.now() - 61_000 });
  await checkNext();
  expect((await readState()).lastCheck).not.toBeNull();
});

it("не отправляет куки пользователя на проверяемые сайты", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
  await checkUrl("https://example.com");
  expect(fetchSpy.mock.calls[0][1]).toMatchObject({ credentials: "omit" });
});

it("откатывается на GET, когда сервер не поддерживает HEAD", async () => { /* ... */ });
it("возвращает TIMEOUT, а не ERR, когда истекло время ожидания", async () => { /* ... */ });
```

```ts
// tests/unit/status.test.ts
it.each([
  [200, "ok"], [204, "ok"], [301, "redirect"], [404, "clienterr"],
  [500, "servererr"], ["ERR", "neterr"], ["TIMEOUT", "neterr"], [null, "pending"],
])("badgeClass(%s) === %s", (status, expected) => {
  expect(badgeClass(status as Status)).toBe(expected);
});
```

**Цель покрытия:** `shared/` — 100%, `background/` — 80%+, `popup/render` — «дымовые»
тесты (рисует ожидаемое число строк, поиск фильтрует, выделение через shift берёт диапазон).
Гоняться за покрытием DOM-кода смысла нет.

Скрипты: `npm test`, `npm run test:watch`, `npm run coverage`.

---

## 4. Сборка на TypeScript

**Стек:** TypeScript (strict) + esbuild + Node-скрипт сборки. Без webpack/rollup:
у расширения два бандла и нет code splitting — esbuild собирает за ~50 мс.

### package.json

```json
{
  "name": "bookmark-status-checker",
  "version": "1.5.7",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "node scripts/build.mjs",
    "dev": "node scripts/build.mjs --watch",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage",
    "check": "npm run typecheck && npm run lint && npm test"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "@typescript-eslint/eslint-plugin": "^8",
    "@typescript-eslint/parser": "^8",
    "@vitest/coverage-v8": "^2",
    "esbuild": "^0.23",
    "eslint": "^9",
    "jsdom": "^25",
    "prettier": "^3",
    "typescript": "^5.6",
    "vitest": "^2",
    "yazl": "^3"
  }
}
```

`version` из `package.json` становится единственным источником версии — оба манифеста
стампятся на сборке. `yazl` вместо системного `zip`/`Compress-Archive`: всегда
прямые слеши в путях, из-за которых сейчас существует `firefox.py`.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["chrome", "vitest/globals"],
    "paths": { "@shared/*": ["./src/shared/*"] }
  },
  "include": ["src", "tests", "scripts"]
}
```

`strict` + `noUncheckedIndexedAccess` сразу подсветят места вроде
`items[id].url` в `propagateDomainStatus` и `treeRoot[0].children` в `syncBookmarks`,
где сейчас возможен доступ к `undefined`.

### Кросс-браузерный шим с типами

```ts
// shared/api.ts
declare const browser: typeof chrome | undefined;

/** Firefox отдаёт промисы нативно; Chrome MV3 — тоже, если не передавать колбэк. */
export const api: typeof chrome =
  typeof browser !== "undefined" ? (browser as typeof chrome) : chrome;

export const hasSidePanel = (): boolean => "sidePanel" in api;
```

### Манифесты из одного источника

```ts
// src/manifest.config.ts
import pkg from "../package.json" with { type: "json" };

type Target = "chrome" | "firefox";

const base = {
  manifest_version: 3 as const,
  name: "Bookmarks 2 - Bookmarks Checker",
  version: pkg.version,
  description: "Checks your bookmarks one by one and shows the HTTP status code (200, 404, 500, etc.)",
  default_locale: "en",
  host_permissions: ["<all_urls>"],
  icons: { 16: "icons/icon16.png", 48: "icons/icon48.png", 128: "icons/icon128.png" },
  action: {
    default_popup: "popup.html",
    default_title: "Bookmarks 2 - Bookmarks Checker",
    default_icon: { 16: "icons/icon16.png", 48: "icons/icon48.png", 128: "icons/icon128.png" },
  },
};

export function manifestFor(target: Target) {
  if (target === "chrome") {
    return {
      ...base,
      permissions: ["bookmarks", "storage", "alarms", "tabs", "sidePanel"],
      background: { service_worker: "background.js", type: "module" },
      side_panel: { default_path: "sidepanel.html" },
    };
  }
  return {
    ...base,
    permissions: ["bookmarks", "storage", "alarms", "tabs"],
    background: { scripts: ["background.js"], type: "module" },
    browser_specific_settings: {
      gecko: {
        id: "bookmark-status-checker@example.com",
        strict_min_version: "115.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  };
}
```

### scripts/build.mjs

```js
import { build, context } from "esbuild";
import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { manifestFor } from "../src/manifest.config.ts";

const TARGETS = ["chrome", "firefox"];
const watch = process.argv.includes("--watch");

await rm("dist", { recursive: true, force: true });

for (const target of TARGETS) {
  const outdir = `dist/${target}`;
  await mkdir(outdir, { recursive: true });

  const options = {
    entryPoints: ["src/background/index.ts", "src/popup/index.ts"],
    entryNames: "[name]",                       // -> background.js, popup.js
    outdir,
    bundle: true,
    format: "esm",
    target: ["chrome114", "firefox115"],
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    define: { __TARGET__: JSON.stringify(target) },   // мёртвые ветки вырезаются
    logLevel: "info",
  };

  if (watch) await (await context(options)).watch();
  else await build(options);

  // статика
  await cp("src/_locales", `${outdir}/_locales`, { recursive: true });
  await cp("src/icons", `${outdir}/icons`, { recursive: true });
  await cp("src/ui/popup.css", `${outdir}/popup.css`);

  // popup.html + сгенерированный sidepanel.html (только Chrome)
  const html = await readFile("src/ui/popup.html", "utf8");
  await writeFile(`${outdir}/popup.html`, html);
  if (target === "chrome") {
    await writeFile(`${outdir}/sidepanel.html`, html.replace("<body>", '<body class="side-panel-mode">'));
  }

  await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifestFor(target), null, 2));

  if (!watch) await zipDir(outdir, `dist/bookmark-status-checker-${target}.zip`);   // yazl, forward slashes
}
```

Это заменяет `build.sh` + `build.bat` + `firefox.py` одним кроссплатформенным скриптом.
`__TARGET__` позволяет выкинуть из firefox-бандла весь код side panel на этапе сборки,
вместо текущей рантайм-проверки `if (!api.sidePanel)`.

### Флаг `type: "module"` в background

Модульный service worker (`"type": "module"`) нужен, чтобы esbuild мог выдавать ESM.
Firefox поддерживает его с 115 — совпадает с текущим `strict_min_version`.

### CI (.github/workflows/ci.yml)

```yaml
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run check       # typecheck + lint + tests
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with: { name: extensions, path: dist/*.zip }
```

---

## Порядок внедрения

Миграция не требует «большого взрыва» — `allowJs: true` в tsconfig позволяет
переводить файлы по одному, сохраняя рабочую сборку на каждом шаге.

| Шаг | Что | Риск |
|---|---|---|
| 1 | Починить баги §1.1–§1.3 прямо в текущем JS | низкий, пользовательский эффект сразу |
| 2 | Добавить `package.json`, `tsconfig`, esbuild, `scripts/build.mjs`; выбросить `build.sh/.bat/firefox.py` | низкий, поведение не меняется |
| 3 | Вынести `shared/` (types, storage, queue, status, url, time, i18n) — это уже .ts | низкий |
| 4 | Тесты на `shared/` — сеть безопасности перед разборкой popup | — |
| 5 | Разобрать `background.js` на модули + router | средний |
| 6 | Разобрать `popup.js` на модули | высокий — делать по одному модулю за PR |
| 7 | Инкрементальный рендер (§1.6) и делегирование событий (§1.7) | средний |
| 8 | CI, eslint, прогон покрытия | — |

Шаги 1–4 дают основную часть выгоды и почти ничем не рискуют; 5–7 стоит разносить
по отдельным PR.
