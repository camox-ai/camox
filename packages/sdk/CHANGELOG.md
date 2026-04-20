# Changelog

## [0.10.1](https://github.com/camox-ai/camox/compare/camox-v0.10.0...camox-sdk-v0.10.1) (2026-04-20)


### Bug Fixes

* remaining hydration issues ([4432899](https://github.com/camox-ai/camox/commit/4432899f846491607cbbadeb4fce0485cdd6796c))
* ssr Link href ([3015859](https://github.com/camox-ai/camox/commit/3015859946421702fe44d12c0f6a507433415c31))

## [0.10.0](https://github.com/camox-ai/camox/compare/camox-v0.9.1...camox-sdk-v0.10.0) (2026-04-19)


### Features

* **sdk:** add error boundary for each block ([48f04a8](https://github.com/camox-ai/camox/commit/48f04a81f5ce02095c1afbdf8c739478eeb2c2db))


### Bug Fixes

* debounced LinkFieldEditor url ([465db76](https://github.com/camox-ai/camox/commit/465db76647c9983bd33c183694c80a858e8c0c03))
* various bugs ([86e66ba](https://github.com/camox-ai/camox/commit/86e66badfc79030e49513d5403fe7089b12814fd))
* vite optimizer causing page reloads in dev ([6b62b5c](https://github.com/camox-ai/camox/commit/6b62b5c476b29b468c402440592c02f43fb22637))


### Miscellaneous

* add BeforeBlocks and AfterBlocks to createLayout instead of individual references ([7c44700](https://github.com/camox-ai/camox/commit/7c447001397052958240ce33b9efdec57023da43))
* clean up api surface of createBlock and createLayout using _internal in return value ([71f8d8f](https://github.com/camox-ai/camox/commit/71f8d8f5a0987d4e00b7c793b1f57a1b97f7d6df))
* convert create page sheet to modal ([40463a3](https://github.com/camox-ai/camox/commit/40463a3143cd16a4b0e2bed99668a2733dd847e8))
* convert edit page sheet to modal ([487b0a5](https://github.com/camox-ai/camox/commit/487b0a5a664fcfe821289a877f3c66156067dd05))
* misc fixes ([6fced4b](https://github.com/camox-ai/camox/commit/6fced4bf0ff5b56cd58bb8ed3098638daf7fd7fb))
* move createLayout initial blocks to blocks object ([c4b6d96](https://github.com/camox-ai/camox/commit/c4b6d96dfa2566d9841928bfbd747ca4402454a0))
* remove PageTree prop drilling ([1e1e6fd](https://github.com/camox-ai/camox/commit/1e1e6fdf4a3aab7b15d8c5ebdb2979f632f047f9))
* scope partykit rooms by environment instead of project ([a316561](https://github.com/camox-ai/camox/commit/a31656130032fe206bc9758022b6ac5a9f501098))
* store ids as numbers in selection state ([7892ff0](https://github.com/camox-ai/camox/commit/7892ff0dc19c986238fb5d774352d37c093fcf65))

## [0.9.1](https://github.com/camox-ai/camox/compare/camox-v0.9.0...camox-sdk-v0.9.1) (2026-04-18)


### Bug Fixes

* broken websocket in production ([b19d70b](https://github.com/camox-ai/camox/commit/b19d70b94790e225bdeb8617bf5972ba211514f0))
* cascading deletes on block deletion ([6df62c2](https://github.com/camox-ai/camox/commit/6df62c26b583a70d76d2ca28a9a9e045e70e08f6))
* create missing layout blocks on sync ([dc1373a](https://github.com/camox-ai/camox/commit/dc1373af592956d6835eaabcae217dc7c86b404d))
* layout block creation ([4e8a481](https://github.com/camox-ai/camox/commit/4e8a481bab937e8d58e457ac64a765e10ad9abc6))
* peeked page not clearing on popover close ([2019751](https://github.com/camox-ai/camox/commit/20197515b36b31fba7074afb5753777df83ebb38))
* show sign in toast to unauthenticated users in dev ([d64549e](https://github.com/camox-ai/camox/commit/d64549eaf1261d4b5664d4d23c8b26546d5ae3f2))


### Miscellaneous

* fix auth client type safety ([0084668](https://github.com/camox-ai/camox/commit/0084668e48137f49ec9024468758437c741209cf))

## [0.9.0](https://github.com/camox-ai/camox/compare/camox-v0.8.0...camox-sdk-v0.9.0) (2026-04-17)


### Miscellaneous

* **camox-sdk:** Synchronize camox versions

## [0.8.0](https://github.com/camox-ai/camox/compare/camox-v0.7.3...camox-sdk-v0.8.0) (2026-04-16)


### Features

* add studio-authorize consent page ([48176ee](https://github.com/camox-ai/camox/commit/48176ee3123f3b5675ec3b1fa7a7acdb0aa60cc6))


### Miscellaneous

* refactor dashboard ui ([7064401](https://github.com/camox-ai/camox/commit/70644017a8b58552822233a37c14a77dd92fa39d))
* various improvements ([5fbdb6a](https://github.com/camox-ai/camox/commit/5fbdb6a12d1423b2c5921c5a044603616ce1877d))

## [0.7.3](https://github.com/camox-ai/camox/compare/camox-v0.7.2...camox-sdk-v0.7.3) (2026-04-16)


### Bug Fixes

* css build error on created apps ([f5fb662](https://github.com/camox-ai/camox/commit/f5fb6624f007658bb8caea56653cebb396964b9d))

## [0.7.2](https://github.com/camox-ai/camox/compare/camox-v0.7.1...camox-sdk-v0.7.2) (2026-04-16)


### Miscellaneous

* build css with tailwindcss cli ([6fb99c6](https://github.com/camox-ai/camox/commit/6fb99c6691505e675275d27609d3a33d9beeed89))
* migrate sdk to tsdown build pipeline ([ef339c6](https://github.com/camox-ai/camox/commit/ef339c68b9ab5f5dbd456d8a23812da04a8ccd7d))

## [0.7.1](https://github.com/camox-ai/camox/compare/camox-v0.7.0...camox-sdk-v0.7.1) (2026-04-16)


### Miscellaneous

* add api contract package ([491ef44](https://github.com/camox-ai/camox/commit/491ef44c119f28a2f3ccecb34b8cdbcf632849e1))

## [0.7.0](https://github.com/camox-ai/camox/compare/camox-v0.6.1...camox-sdk-v0.7.0) (2026-04-16)


### Features

* add disabeCodeGen _internal option to vite ([c2a96c3](https://github.com/camox-ai/camox/commit/c2a96c3dd0b93896b8a66ebfbcf2337cfb2faf91))


### Bug Fixes

* post base ui migration tweaks ([0d72dee](https://github.com/camox-ai/camox/commit/0d72dee380b304770769d54bb6c0770a3c73e654))
* remaining asChild in blocks ([f7e7d82](https://github.com/camox-ai/camox/commit/f7e7d82f0cf8302f2249c7cc8d0e8f1774495927))
* some cli template issues ([359f00f](https://github.com/camox-ai/camox/commit/359f00f4f83f618d35ae09f64adf6df1f7011b35))


### Miscellaneous

* migrate app template to base ui ([4f470a4](https://github.com/camox-ai/camox/commit/4f470a40f77a100dc65ea8a07f13123202f2782e))
* migrate popover to base ui ([826aae6](https://github.com/camox-ai/camox/commit/826aae69222c4906b932514d2512160e524197ae))
* migrate ui package to base ui ([24439ee](https://github.com/camox-ai/camox/commit/24439eecc426b72f8136d4217792847c3a0ace34))
* use css for overlay styles instead of inline style tags ([827dbf4](https://github.com/camox-ai/camox/commit/827dbf4cece76fc3f403f2f366678541abe5dbf4))
* use render prop based api for editable components instead of radix slot ([33ae569](https://github.com/camox-ai/camox/commit/33ae5698307333dbec9b9e4c1ab78b339be3f889))

## [0.6.1](https://github.com/camox-ai/camox/compare/camox-v0.6.0...camox-sdk-v0.6.1) (2026-04-14)


### Bug Fixes

* definitions sync nitro support ([84021d9](https://github.com/camox-ai/camox/commit/84021d9d3ef4edb69b462a8096041f1505e5124a))

## [0.6.0](https://github.com/camox-ai/camox/compare/camox-v0.5.2...camox-sdk-v0.6.0) (2026-04-14)


### Features

* manage multiple auth providers in auth.json file ([3528ea5](https://github.com/camox-ai/camox/commit/3528ea5f75b08edf61bfa16d5d19cffc8505e51e))


### Bug Fixes

* force useSyncExternalStore via react and not shim package ([cd1b72c](https://github.com/camox-ai/camox/commit/cd1b72cbee73da41602b579e7b328b4d92a07ba0))

## [0.5.2](https://github.com/camox-ai/camox/compare/camox-v0.5.1...camox-sdk-v0.5.2) (2026-04-14)


### Miscellaneous

* **camox-sdk:** Synchronize camox versions

## [0.5.1](https://github.com/camox-ai/camox/compare/camox-v0.5.0...camox-sdk-v0.5.1) (2026-04-14)


### Miscellaneous

* **camox-sdk:** Synchronize camox versions

## [0.5.0](https://github.com/camox-ai/camox/compare/camox-v0.4.2...camox-sdk-v0.5.0) (2026-04-14)


### Miscellaneous

* **camox-sdk:** Synchronize camox versions

## [0.4.2](https://github.com/camox-ai/camox/compare/camox-v0.4.1...camox-sdk-v0.4.2) (2026-04-13)


### Miscellaneous

* **camox-sdk:** Synchronize camox versions

## [0.4.1](https://github.com/camox-ai/camox/compare/camox-v0.4.0...camox-sdk-v0.4.1) (2026-04-13)


### Bug Fixes

* cli template ([6e7147d](https://github.com/camox-ai/camox/commit/6e7147dc2a175c79dd4e225f7d09f1e826436fc7))

## [0.4.0](https://github.com/camox-ai/camox/compare/camox-v0.3.1...camox-sdk-v0.4.0) (2026-04-13)


### Features

* **sdk:** add powered by camox link ([7fb2e8a](https://github.com/camox-ai/camox/commit/7fb2e8a2b28fb43de041d4dfce1d4b5ea9df574f))


### Miscellaneous

* remove definitionsSync from camox vite options ([7c3411f](https://github.com/camox-ai/camox/commit/7c3411fce9519807d4c7a3a1149580306bea621a))

## [0.3.1](https://github.com/camox-ai/camox/compare/camox-v0.3.0...camox-sdk-v0.3.1) (2026-04-13)


### Miscellaneous

* drop extraneous typescript dependency ([4189347](https://github.com/camox-ai/camox/commit/41893478954f0cc4baaf9de61d41e997394f1eb3))
* set up rolldown react compiler ([ec250f6](https://github.com/camox-ai/camox/commit/ec250f6dbf2f8b2e33f34ded8c2183adb3090eef))
* upgrade all deps ([7155d86](https://github.com/camox-ai/camox/commit/7155d863e1fd617db6a4312b33daad4d047b5fc8))
* use react stable version ([2414936](https://github.com/camox-ai/camox/commit/24149362afa636eadb9c3eda0d15815cd0b2cb90))

## [0.3.0](https://github.com/camox-ai/camox/compare/camox-sdk-v0.2.0...camox-sdk-v0.3.0) (2026-04-12)


### Features

* add dedicated environment menu to navbar ([9d0fffa](https://github.com/camox-ai/camox/commit/9d0fffa3577819e95430fe1d8238121fd5994d87))
* add environments concept to scope db per-user in dev ([40f1b11](https://github.com/camox-ai/camox/commit/40f1b113f473ca1af9468bfce5a711e7c906a8de))
* add itialBlocks to createLayout for declarative initial content generation ([27ded94](https://github.com/camox-ai/camox/commit/27ded94210d958d02a9bb5a7cb822b381ff04a1b))
* add page metadata button to sidebar ([622ed83](https://github.com/camox-ai/camox/commit/622ed83197d171a44812eb464b541736a6a876a7))
* add sitemap util ([7fbf740](https://github.com/camox-ai/camox/commit/7fbf740b2a19d6762c03044dcd59217049a6b811))
* auto generate project initial content in vite plugin ([18d0599](https://github.com/camox-ai/camox/commit/18d059981e1e629d64dc1fc6891d284eefcbe8da))
* introduce sync secret to authenticate definition routes ([70251f2](https://github.com/camox-ai/camox/commit/70251f262c8f19961f1b7c50470f3977ab1eacb7))
* make create-camox auto run app ([ede571b](https://github.com/camox-ai/camox/commit/ede571b8b8eda3fc931409d6ae6997ae1702d1fd))
* **sdk:** add partykit query invalidation ([7828774](https://github.com/camox-ai/camox/commit/7828774666f4e07cfa19071eb69b4bc2dcb0450c))
* set up cli package and sdk reexport ([b5c0493](https://github.com/camox-ai/camox/commit/b5c0493464ab0e9ec8b02d159573f43111033c43))
* show sync secret in project dashboard ([3675495](https://github.com/camox-ai/camox/commit/36754951775553a0ad2b4f1edf89facd8e99c1af))
* store default content in block definitions ([b1d8657](https://github.com/camox-ai/camox/commit/b1d865716a4569c2334b9f1731fc306b83c8292f))


### Bug Fixes

* **api:** ai image metadata generation ([08da599](https://github.com/camox-ai/camox/commit/08da599803fc73f1a54d2407117bb8f14c75d4a0))
* authenticate seed route ([92ce5a1](https://github.com/camox-ai/camox/commit/92ce5a183f431ce86796f685543c7db8e64cd3e7))
* block reordering and upload ([7ba5534](https://github.com/camox-ai/camox/commit/7ba5534d5ffdf536b9616ca0007ae9d29f1af9d5))
* blocks reordering ([61a9f71](https://github.com/camox-ai/camox/commit/61a9f71a857e0c3f87b04d8e7f02fac89c5003fa))
* breadcrumbs performance ([e4fbdde](https://github.com/camox-ai/camox/commit/e4fbdde2d1db37e09cf6fd877ed35113cd73749e))
* bulk delete files ([4001898](https://github.com/camox-ai/camox/commit/4001898911e14e6352a4e748c7d841cba7909a8c))
* convex _id to d1 id ([c4654c7](https://github.com/camox-ai/camox/commit/c4654c700aa72c3d39db4397c6d4244fa898ee32))
* definitions sync failing ([b2b2638](https://github.com/camox-ai/camox/commit/b2b2638d8d53087c4f1f3c6fce3ceebacdc40bc3))
* multiple file fields corrupt data ([24ef219](https://github.com/camox-ai/camox/commit/24ef2196d4b6029dc9a758d5247ebab7e60d2332))
* nested repeatable items not resolving ([4110d71](https://github.com/camox-ai/camox/commit/4110d71332d446d58f9204104ceac82fbaf878cf))
* playground css breaking build ([fbf28a5](https://github.com/camox-ai/camox/commit/fbf28a5063e693658773145857666f9536519cc1))
* repeatable item creation and ghost items ([8a08118](https://github.com/camox-ai/camox/commit/8a08118c8173cff102c11cfa3033c3f8dd80c13d))
* **sdk:** editing repeatable item fields in sidebar ([9bb5ae9](https://github.com/camox-ai/camox/commit/9bb5ae99bcea33b654aec83042c7cd99c3e61990))
* **sdk:** repeatable items not detected ([155964d](https://github.com/camox-ai/camox/commit/155964d1670876eaf887a3f887da1aa4313babd2))
* **sdk:** retrieve project by slug ([fe37eea](https://github.com/camox-ai/camox/commit/fe37eea83f7ae2f4d3788a1830a7d43643b82cf4))
* server side rendering ([5d33f2c](https://github.com/camox-ai/camox/commit/5d33f2c61fb2012c32ad105523ce2713f801ec51))
* sync definitions during build ([2b93bad](https://github.com/camox-ai/camox/commit/2b93bada3758c4e62e001249d638efa191fa9bae))
* use project specific sync secret ([3e5748a](https://github.com/camox-ai/camox/commit/3e5748a3662945470b9d919fc03099d181683dfd))
* various issues ([7d3d89f](https://github.com/camox-ai/camox/commit/7d3d89f45a1b9d46500cdbac544f7d65d71e7560))
* various ui tweaks ([4fe6adb](https://github.com/camox-ai/camox/commit/4fe6adb64668846d4898e5f023ee647720ac22d3))
* **web:** cross domain auth ([79ef5be](https://github.com/camox-ai/camox/commit/79ef5be2a09ce30a157656403fc14cff703f5a4c))
* **web:** race condition when switching org ([f789a14](https://github.com/camox-ai/camox/commit/f789a14da71575984113856235ad9f62d3683368))


### Refactoring

* fetch ssr data through tanstack query ([1b58709](https://github.com/camox-ai/camox/commit/1b5870998da00812415d5fa99111eb058abc1d70))
* move query key definition and invalidation to backend ([a4d6dbc](https://github.com/camox-ai/camox/commit/a4d6dbc295543862759a153a7e1e96affaba7e3c))
* normalize images in page response ([3bf3e01](https://github.com/camox-ai/camox/commit/3bf3e017a7329ad7c8a6d92f49231dc30bf3ba03))
* **sdk:** centralize all API mutations into tanstack query mutation factories ([ec30ff8](https://github.com/camox-ai/camox/commit/ec30ff8d1b9ffba6174c8c55512de9cd61d5da59))
* **sdk:** extract camox dev options to _config vite options ([22a6c78](https://github.com/camox-ai/camox/commit/22a6c78c3c5e6e8e5e3e223ced04488f7b10ca05))
* **sdk:** make components subscribe to granular cache items ([fa9b771](https://github.com/camox-ai/camox/commit/fa9b771da39876082ace1af98edd550be177bb29))
* **sdk:** rework breadcrumbs system (wip) ([1bb2be4](https://github.com/camox-ai/camox/commit/1bb2be4d85ed237bdc6c8652db4df29d38b9cc63))
* store markdown and move lexical conversion to editor level ([741e57f](https://github.com/camox-ai/camox/commit/741e57f614f19b3407e2b1ec643d280de64cda47))


### Documentation

* add cli architecture plan ([1c6012f](https://github.com/camox-ai/camox/commit/1c6012fcdc09e1b69cd3dec7dfe6e9c1e9c0196f))


### Miscellaneous

* add queryClient to router context on createRouter ([6bfb7f8](https://github.com/camox-ai/camox/commit/6bfb7f85ba23ebe8dc0224b73becf7b2a6fd9111))
* clean up remainingrepeatable object references ([302ad60](https://github.com/camox-ai/camox/commit/302ad60c96e8fed24f8bfa43aa50828ff89e4dd9))
* declutter oxlint configs ([9a89597](https://github.com/camox-ai/camox/commit/9a89597310a97606894f59c76e4881ee1d281f69))
* delete project domain and description ([8a1ee2d](https://github.com/camox-ai/camox/commit/8a1ee2d9597fced845ee47c1c917401ae70a0388))
* delete remaining convex code in sdk ([c390d8c](https://github.com/camox-ai/camox/commit/c390d8cdeaa44285874403724e96997d291a2cc9))
* ignore generated files in linter and formatter ([a87ff5f](https://github.com/camox-ai/camox/commit/a87ff5f0a6f7ba1eba39a70956a81152c11617bf))
* implement better-auth cross domain plugin internally ([080603d](https://github.com/camox-ai/camox/commit/080603df0970e359b80d631c917adce0e8c4c0f7))
* migrate definitions sync to orpc ([dfa6b90](https://github.com/camox-ai/camox/commit/dfa6b90013ad1e0efcfb460d1fd8c50af48c4024))
* migrate from hono rpc to orpc ([08d8c77](https://github.com/camox-ai/camox/commit/08d8c772446a33029026dd4e2fa7e1ec539a47eb))
* migrate sdk auth actions to hono api ([0754ad4](https://github.com/camox-ai/camox/commit/0754ad43546920272e0d33e7b0ccb6cffdba0161))
* mitigate layout shift on block reorder ([a907b33](https://github.com/camox-ai/camox/commit/a907b33f8503def20590de9d835a2ead119527f0))
* move hono api client out of react context ([b583157](https://github.com/camox-ai/camox/commit/b58315785035df2e9263d28ce3b975c8bbb29fc5))
* normalize page response ([9bc2516](https://github.com/camox-ai/camox/commit/9bc25164f9dab8f8536a36202451fb771e5e7765))
* normalize peeked block repeatable items ([71a2dbd](https://github.com/camox-ai/camox/commit/71a2dbd208c1f4ee372bcdb0ab5472fad9dc9f3d))
* release main ([10f2404](https://github.com/camox-ai/camox/commit/10f24049b5d4797fdb825efb831b9591f5c85973))
* release main ([c70b4a8](https://github.com/camox-ai/camox/commit/c70b4a850a5ad69e3effec04116277398cf9def2))
* release main ([7161c8e](https://github.com/camox-ai/camox/commit/7161c8ef08f144d6f7997bc8cd605b6cc26f669d))
* release main ([62dcf04](https://github.com/camox-ai/camox/commit/62dcf04f72a911c383f14f1f445726a2ebd756f9))
* release main ([#3](https://github.com/camox-ai/camox/issues/3)) ([daa00dd](https://github.com/camox-ai/camox/commit/daa00dd18a5c2784b58f6374f93a8cc8caddcb52))
* release main ([#3](https://github.com/camox-ai/camox/issues/3)) ([f589aaa](https://github.com/camox-ai/camox/commit/f589aaadc6f98c2921a5c51445d31229c5be4bc4))
* release main ([#4](https://github.com/camox-ai/camox/issues/4)) ([23e5f3e](https://github.com/camox-ai/camox/commit/23e5f3e3d8894e14d57904992c57a8bb1456c5de))
* release main ([#5](https://github.com/camox-ai/camox/issues/5)) ([532d93d](https://github.com/camox-ai/camox/commit/532d93d763523f77e8f70e47721a6c133e437f39))
* release main ([#6](https://github.com/camox-ai/camox/issues/6)) ([e2d023c](https://github.com/camox-ai/camox/commit/e2d023c660d56710b6a65f7bc664652755e6fbd8))
* remove dynamic contenteditable tag on lexical inputs ([41fdf5f](https://github.com/camox-ai/camox/commit/41fdf5fe6fd9033b2eebedf1f4eb803f5b9bccb1))
* rename repeatable object to repeatable item ([6f8c054](https://github.com/camox-ai/camox/commit/6f8c0545cc22dda7469c654a9d50d65450093e59))
* **sdk:** migrate mutations to new api ([76b6aae](https://github.com/camox-ai/camox/commit/76b6aaeb1d3a0e105219cfa39ce31797ac4c011d))
* **sdk:** migrate read operations to hono api ([b588e8e](https://github.com/camox-ai/camox/commit/b588e8e9769e172ff743ea982a850c8adfc9c6cf))
* seed individual tanstack cache queries ([d89ab96](https://github.com/camox-ai/camox/commit/d89ab96f47273efa1f62584447719948093b66ea))
* set up release-please ([b77b064](https://github.com/camox-ai/camox/commit/b77b064ab6f80e87fa22e70fbb9cac01505ff336))
* specify css source only once ([7fa0d78](https://github.com/camox-ai/camox/commit/7fa0d78555bc7ab58a965f63f2c45c8e6a49ff57))

## [0.2.0-alpha.5](https://github.com/camox-ai/camox/compare/camox-v0.2.0-alpha.4...camox-sdk-v0.2.0-alpha.5) (2026-04-10)


### Miscellaneous

* **camox-sdk:** Synchronize camox versions

## [0.2.0-alpha.4](https://github.com/camox-ai/camox/compare/camox-v0.2.0-alpha.3...camox-sdk-v0.2.0-alpha.4) (2026-04-10)


### Miscellaneous

* **camox-sdk:** Synchronize camox versions

## [0.2.0-alpha.3](https://github.com/camox-ai/camox/compare/camox-v0.2.0-alpha.2...camox-sdk-v0.2.0-alpha.3) (2026-04-10)


### Miscellaneous

* **camox-sdk:** Synchronize camox versions

## [0.2.0-alpha.2](https://github.com/camox-ai/camox/compare/camox-v0.1.2-alpha.2...camox-sdk-v0.2.0-alpha.2) (2026-04-10)


### Features

* add dedicated environment menu to navbar ([9d0fffa](https://github.com/camox-ai/camox/commit/9d0fffa3577819e95430fe1d8238121fd5994d87))
* add environments concept to scope db per-user in dev ([40f1b11](https://github.com/camox-ai/camox/commit/40f1b113f473ca1af9468bfce5a711e7c906a8de))
* add itialBlocks to createLayout for declarative initial content generation ([27ded94](https://github.com/camox-ai/camox/commit/27ded94210d958d02a9bb5a7cb822b381ff04a1b))
* add page metadata button to sidebar ([622ed83](https://github.com/camox-ai/camox/commit/622ed83197d171a44812eb464b541736a6a876a7))
* auto generate project initial content in vite plugin ([18d0599](https://github.com/camox-ai/camox/commit/18d059981e1e629d64dc1fc6891d284eefcbe8da))
* introduce sync secret to authenticate definition routes ([70251f2](https://github.com/camox-ai/camox/commit/70251f262c8f19961f1b7c50470f3977ab1eacb7))
* **sdk:** add partykit query invalidation ([7828774](https://github.com/camox-ai/camox/commit/7828774666f4e07cfa19071eb69b4bc2dcb0450c))
* set up cli package and sdk reexport ([b5c0493](https://github.com/camox-ai/camox/commit/b5c0493464ab0e9ec8b02d159573f43111033c43))
* show sync secret in project dashboard ([3675495](https://github.com/camox-ai/camox/commit/36754951775553a0ad2b4f1edf89facd8e99c1af))
* store default content in block definitions ([b1d8657](https://github.com/camox-ai/camox/commit/b1d865716a4569c2334b9f1731fc306b83c8292f))


### Bug Fixes

* **api:** ai image metadata generation ([08da599](https://github.com/camox-ai/camox/commit/08da599803fc73f1a54d2407117bb8f14c75d4a0))
* authenticate seed route ([92ce5a1](https://github.com/camox-ai/camox/commit/92ce5a183f431ce86796f685543c7db8e64cd3e7))
* block reordering and upload ([7ba5534](https://github.com/camox-ai/camox/commit/7ba5534d5ffdf536b9616ca0007ae9d29f1af9d5))
* blocks reordering ([61a9f71](https://github.com/camox-ai/camox/commit/61a9f71a857e0c3f87b04d8e7f02fac89c5003fa))
* breadcrumbs performance ([e4fbdde](https://github.com/camox-ai/camox/commit/e4fbdde2d1db37e09cf6fd877ed35113cd73749e))
* bulk delete files ([4001898](https://github.com/camox-ai/camox/commit/4001898911e14e6352a4e748c7d841cba7909a8c))
* convex _id to d1 id ([c4654c7](https://github.com/camox-ai/camox/commit/c4654c700aa72c3d39db4397c6d4244fa898ee32))
* definitions sync failing ([b2b2638](https://github.com/camox-ai/camox/commit/b2b2638d8d53087c4f1f3c6fce3ceebacdc40bc3))
* multiple file fields corrupt data ([24ef219](https://github.com/camox-ai/camox/commit/24ef2196d4b6029dc9a758d5247ebab7e60d2332))
* nested repeatable items not resolving ([4110d71](https://github.com/camox-ai/camox/commit/4110d71332d446d58f9204104ceac82fbaf878cf))
* repeatable item creation and ghost items ([8a08118](https://github.com/camox-ai/camox/commit/8a08118c8173cff102c11cfa3033c3f8dd80c13d))
* **sdk:** editing repeatable item fields in sidebar ([9bb5ae9](https://github.com/camox-ai/camox/commit/9bb5ae99bcea33b654aec83042c7cd99c3e61990))
* **sdk:** repeatable items not detected ([155964d](https://github.com/camox-ai/camox/commit/155964d1670876eaf887a3f887da1aa4313babd2))
* **sdk:** retrieve project by slug ([fe37eea](https://github.com/camox-ai/camox/commit/fe37eea83f7ae2f4d3788a1830a7d43643b82cf4))
* server side rendering ([5d33f2c](https://github.com/camox-ai/camox/commit/5d33f2c61fb2012c32ad105523ce2713f801ec51))
* sync definitions during build ([2b93bad](https://github.com/camox-ai/camox/commit/2b93bada3758c4e62e001249d638efa191fa9bae))
* various issues ([7d3d89f](https://github.com/camox-ai/camox/commit/7d3d89f45a1b9d46500cdbac544f7d65d71e7560))
* various ui tweaks ([4fe6adb](https://github.com/camox-ai/camox/commit/4fe6adb64668846d4898e5f023ee647720ac22d3))
* **web:** race condition when switching org ([f789a14](https://github.com/camox-ai/camox/commit/f789a14da71575984113856235ad9f62d3683368))


### Refactoring

* fetch ssr data through tanstack query ([1b58709](https://github.com/camox-ai/camox/commit/1b5870998da00812415d5fa99111eb058abc1d70))
* move query key definition and invalidation to backend ([a4d6dbc](https://github.com/camox-ai/camox/commit/a4d6dbc295543862759a153a7e1e96affaba7e3c))
* normalize images in page response ([3bf3e01](https://github.com/camox-ai/camox/commit/3bf3e017a7329ad7c8a6d92f49231dc30bf3ba03))
* **sdk:** centralize all API mutations into tanstack query mutation factories ([ec30ff8](https://github.com/camox-ai/camox/commit/ec30ff8d1b9ffba6174c8c55512de9cd61d5da59))
* **sdk:** extract camox dev options to _config vite options ([22a6c78](https://github.com/camox-ai/camox/commit/22a6c78c3c5e6e8e5e3e223ced04488f7b10ca05))
* **sdk:** make components subscribe to granular cache items ([fa9b771](https://github.com/camox-ai/camox/commit/fa9b771da39876082ace1af98edd550be177bb29))
* **sdk:** rework breadcrumbs system (wip) ([1bb2be4](https://github.com/camox-ai/camox/commit/1bb2be4d85ed237bdc6c8652db4df29d38b9cc63))
* store markdown and move lexical conversion to editor level ([741e57f](https://github.com/camox-ai/camox/commit/741e57f614f19b3407e2b1ec643d280de64cda47))


### Documentation

* add cli architecture plan ([1c6012f](https://github.com/camox-ai/camox/commit/1c6012fcdc09e1b69cd3dec7dfe6e9c1e9c0196f))


### Miscellaneous

* add queryClient to router context on createRouter ([6bfb7f8](https://github.com/camox-ai/camox/commit/6bfb7f85ba23ebe8dc0224b73becf7b2a6fd9111))
* clean up remainingrepeatable object references ([302ad60](https://github.com/camox-ai/camox/commit/302ad60c96e8fed24f8bfa43aa50828ff89e4dd9))
* declutter oxlint configs ([9a89597](https://github.com/camox-ai/camox/commit/9a89597310a97606894f59c76e4881ee1d281f69))
* delete project domain and description ([8a1ee2d](https://github.com/camox-ai/camox/commit/8a1ee2d9597fced845ee47c1c917401ae70a0388))
* delete remaining convex code in sdk ([c390d8c](https://github.com/camox-ai/camox/commit/c390d8cdeaa44285874403724e96997d291a2cc9))
* implement better-auth cross domain plugin internally ([080603d](https://github.com/camox-ai/camox/commit/080603df0970e359b80d631c917adce0e8c4c0f7))
* migrate definitions sync to orpc ([dfa6b90](https://github.com/camox-ai/camox/commit/dfa6b90013ad1e0efcfb460d1fd8c50af48c4024))
* migrate from hono rpc to orpc ([08d8c77](https://github.com/camox-ai/camox/commit/08d8c772446a33029026dd4e2fa7e1ec539a47eb))
* migrate sdk auth actions to hono api ([0754ad4](https://github.com/camox-ai/camox/commit/0754ad43546920272e0d33e7b0ccb6cffdba0161))
* mitigate layout shift on block reorder ([a907b33](https://github.com/camox-ai/camox/commit/a907b33f8503def20590de9d835a2ead119527f0))
* move hono api client out of react context ([b583157](https://github.com/camox-ai/camox/commit/b58315785035df2e9263d28ce3b975c8bbb29fc5))
* normalize page response ([9bc2516](https://github.com/camox-ai/camox/commit/9bc25164f9dab8f8536a36202451fb771e5e7765))
* normalize peeked block repeatable items ([71a2dbd](https://github.com/camox-ai/camox/commit/71a2dbd208c1f4ee372bcdb0ab5472fad9dc9f3d))
* remove dynamic contenteditable tag on lexical inputs ([41fdf5f](https://github.com/camox-ai/camox/commit/41fdf5fe6fd9033b2eebedf1f4eb803f5b9bccb1))
* rename repeatable object to repeatable item ([6f8c054](https://github.com/camox-ai/camox/commit/6f8c0545cc22dda7469c654a9d50d65450093e59))
* **sdk:** migrate mutations to new api ([76b6aae](https://github.com/camox-ai/camox/commit/76b6aaeb1d3a0e105219cfa39ce31797ac4c011d))
* **sdk:** migrate read operations to hono api ([b588e8e](https://github.com/camox-ai/camox/commit/b588e8e9769e172ff743ea982a850c8adfc9c6cf))
* seed individual tanstack cache queries ([d89ab96](https://github.com/camox-ai/camox/commit/d89ab96f47273efa1f62584447719948093b66ea))
* specify css source only once ([7fa0d78](https://github.com/camox-ai/camox/commit/7fa0d78555bc7ab58a965f63f2c45c8e6a49ff57))

## [0.1.2-alpha.2](https://github.com/camox-ai/camox/compare/camox-v0.1.2-alpha.1...camox-sdk-v0.1.2-alpha.2) (2026-03-25)


### Bug Fixes

* playground css breaking build ([fbf28a5](https://github.com/camox-ai/camox/commit/fbf28a5063e693658773145857666f9536519cc1))


### Miscellaneous

* ignore generated files in linter and formatter ([a87ff5f](https://github.com/camox-ai/camox/commit/a87ff5f0a6f7ba1eba39a70956a81152c11617bf))

## [0.1.2-alpha.1](https://github.com/camox-ai/camox/compare/camox-v0.1.2-alpha.0...camox-sdk-v0.1.2-alpha.1) (2026-03-25)


### Miscellaneous

* **camox-sdk:** Synchronize camox versions

## [0.1.2-alpha.0](https://github.com/camox-ai/camox/compare/camox-v0.1.1-alpha.0...camox-sdk-v0.1.2-alpha.0) (2026-03-25)

### Features

- make create-camox auto run app ([ede571b](https://github.com/camox-ai/camox/commit/ede571b8b8eda3fc931409d6ae6997ae1702d1fd))

## [0.1.1-alpha.0](https://github.com/camox-ai/camox/compare/camox-v0.1.0-alpha.0...camox-v0.1.1-alpha.0) (2026-03-25)

### Miscellaneous

- set up release-please ([b77b064](https://github.com/camox-ai/camox/commit/b77b064ab6f80e87fa22e70fbb9cac01505ff336))
