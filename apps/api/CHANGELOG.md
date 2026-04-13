# Changelog

## [0.4.0](https://github.com/camox-ai/camox/compare/camox-v0.3.1...@camox/api-v0.4.0) (2026-04-13)


### Features

* **web:** project deletion ([f84688a](https://github.com/camox-ai/camox/commit/f84688a579c82bb67b0cf07b87e780ec5f088459))

## [0.3.1](https://github.com/camox-ai/camox/compare/camox-v0.3.0...@camox/api-v0.3.1) (2026-04-13)


### Miscellaneous

* set up rolldown react compiler ([ec250f6](https://github.com/camox-ai/camox/commit/ec250f6dbf2f8b2e33f34ded8c2183adb3090eef))

## [0.3.0](https://github.com/camox-ai/camox/compare/@camox/api-v0.2.0...@camox/api-v0.3.0) (2026-04-12)


### Features

* add environments concept to scope db per-user in dev ([40f1b11](https://github.com/camox-ai/camox/commit/40f1b113f473ca1af9468bfce5a711e7c906a8de))
* add itialBlocks to createLayout for declarative initial content generation ([27ded94](https://github.com/camox-ai/camox/commit/27ded94210d958d02a9bb5a7cb822b381ff04a1b))
* add page metadata button to sidebar ([622ed83](https://github.com/camox-ai/camox/commit/622ed83197d171a44812eb464b541736a6a876a7))
* add sitemap util ([7fbf740](https://github.com/camox-ai/camox/commit/7fbf740b2a19d6762c03044dcd59217049a6b811))
* ai features in api with durable object alarms ([eb66c75](https://github.com/camox-ai/camox/commit/eb66c758b789e5b46f50e6e35d998ec971ca6753))
* auto create org on signup ([4acb6ca](https://github.com/camox-ai/camox/commit/4acb6cabcd3cdc6e563d10c5cc5a130119c3971d))
* auto generate project initial content in vite plugin ([18d0599](https://github.com/camox-ai/camox/commit/18d059981e1e629d64dc1fc6891d284eefcbe8da))
* auto select first project ([47e166a](https://github.com/camox-ai/camox/commit/47e166ae929df895e7c300498aea903547ec22c6))
* introduce sync secret to authenticate definition routes ([70251f2](https://github.com/camox-ai/camox/commit/70251f262c8f19961f1b7c50470f3977ab1eacb7))
* **sdk:** add partykit query invalidation ([7828774](https://github.com/camox-ai/camox/commit/7828774666f4e07cfa19071eb69b4bc2dcb0450c))
* server project creation in cli ([5a5138a](https://github.com/camox-ai/camox/commit/5a5138ae2a169de1e486e719a4471f1374f424e6))
* show sync secret in project dashboard ([3675495](https://github.com/camox-ai/camox/commit/36754951775553a0ad2b4f1edf89facd8e99c1af))
* store default content in block definitions ([b1d8657](https://github.com/camox-ai/camox/commit/b1d865716a4569c2334b9f1731fc306b83c8292f))


### Bug Fixes

* add org-based permission checks ([3a032cc](https://github.com/camox-ai/camox/commit/3a032cc36c14982d9e4352f057a4a9d10e3abda3))
* **api:** ai image metadata generation ([08da599](https://github.com/camox-ai/camox/commit/08da599803fc73f1a54d2407117bb8f14c75d4a0))
* **api:** corrupt data in seeded blocks ([df0b9ca](https://github.com/camox-ai/camox/commit/df0b9cab7ffda800a2df110764cee675e719ad39))
* authenticate seed route ([92ce5a1](https://github.com/camox-ai/camox/commit/92ce5a183f431ce86796f685543c7db8e64cd3e7))
* block reordering and upload ([7ba5534](https://github.com/camox-ai/camox/commit/7ba5534d5ffdf536b9616ca0007ae9d29f1af9d5))
* blocks reordering ([61a9f71](https://github.com/camox-ai/camox/commit/61a9f71a857e0c3f87b04d8e7f02fac89c5003fa))
* broken cli when auth session expires ([c9ef4a8](https://github.com/camox-ai/camox/commit/c9ef4a88b8fdf1825c2584a44f1e24ef6124c35f))
* bulk delete files ([4001898](https://github.com/camox-ai/camox/commit/4001898911e14e6352a4e748c7d841cba7909a8c))
* clean up references on file delete ([1954831](https://github.com/camox-ai/camox/commit/19548313dd4dc1d179444ccf322487f4ed475d84))
* cli auth ([2f70ab0](https://github.com/camox-ai/camox/commit/2f70ab0f604e5e98af73ca29324b71a953476327))
* convex _id to d1 id ([c4654c7](https://github.com/camox-ai/camox/commit/c4654c700aa72c3d39db4397c6d4244fa898ee32))
* definitions sync failing ([b2b2638](https://github.com/camox-ai/camox/commit/b2b2638d8d53087c4f1f3c6fce3ceebacdc40bc3))
* multiple file fields corrupt data ([24ef219](https://github.com/camox-ai/camox/commit/24ef2196d4b6029dc9a758d5247ebab7e60d2332))
* nested repeatable items not resolving ([4110d71](https://github.com/camox-ai/camox/commit/4110d71332d446d58f9204104ceac82fbaf878cf))
* release ci ([ee13241](https://github.com/camox-ai/camox/commit/ee132414d0b302238439511f0744171a56e28286))
* remove SEED_SECRET ([11dc727](https://github.com/camox-ai/camox/commit/11dc7274603aab05fcf0e85dc5964715fd12bb46))
* repeatable item creation and ghost items ([8a08118](https://github.com/camox-ai/camox/commit/8a08118c8173cff102c11cfa3033c3f8dd80c13d))
* **sdk:** editing repeatable item fields in sidebar ([9bb5ae9](https://github.com/camox-ai/camox/commit/9bb5ae99bcea33b654aec83042c7cd99c3e61990))
* **sdk:** repeatable items not detected ([155964d](https://github.com/camox-ai/camox/commit/155964d1670876eaf887a3f887da1aa4313babd2))
* simplify web auth ([c5fcb37](https://github.com/camox-ai/camox/commit/c5fcb375689021660e0824b4976c8a64f3dae256))
* use 32 character better auth secret in dev ([8bde6c0](https://github.com/camox-ai/camox/commit/8bde6c0e68c8f4d72e45038f4565a0663597631f))
* use project specific sync secret ([3e5748a](https://github.com/camox-ai/camox/commit/3e5748a3662945470b9d919fc03099d181683dfd))
* various issues ([7d3d89f](https://github.com/camox-ai/camox/commit/7d3d89f45a1b9d46500cdbac544f7d65d71e7560))
* **web:** cross domain auth ([79ef5be](https://github.com/camox-ai/camox/commit/79ef5be2a09ce30a157656403fc14cff703f5a4c))
* **web:** race condition when switching org ([f789a14](https://github.com/camox-ai/camox/commit/f789a14da71575984113856235ad9f62d3683368))


### Refactoring

* move query key definition and invalidation to backend ([a4d6dbc](https://github.com/camox-ai/camox/commit/a4d6dbc295543862759a153a7e1e96affaba7e3c))
* normalize images in page response ([3bf3e01](https://github.com/camox-ai/camox/commit/3bf3e017a7329ad7c8a6d92f49231dc30bf3ba03))
* **sdk:** make components subscribe to granular cache items ([fa9b771](https://github.com/camox-ai/camox/commit/fa9b771da39876082ace1af98edd550be177bb29))
* store markdown and move lexical conversion to editor level ([741e57f](https://github.com/camox-ai/camox/commit/741e57f614f19b3407e2b1ec643d280de64cda47))


### Miscellaneous

* add camox business logic to api ([d3f5ffc](https://github.com/camox-ai/camox/commit/d3f5ffc1a2bb81343d20bfd2e010be903239c997))
* added oxlint to api ([a7a2400](https://github.com/camox-ai/camox/commit/a7a24007b872f292761e8af539edf79d530167a9))
* **api:** add .env.example ([8bb7d33](https://github.com/camox-ai/camox/commit/8bb7d3396dcba9cce1bef2d9fafe41661cac610a))
* **api:** migrate file upload and serve ([054ee02](https://github.com/camox-ai/camox/commit/054ee0295b08f419d6af21ceebb03d03f608af65))
* **api:** move requireAuth middleware to route basis ([dd790e8](https://github.com/camox-ai/camox/commit/dd790e8aa8aeede3b7b60fd498fcd2bccd6e74be))
* clean up remainingrepeatable object references ([302ad60](https://github.com/camox-ai/camox/commit/302ad60c96e8fed24f8bfa43aa50828ff89e4dd9))
* declutter oxlint configs ([9a89597](https://github.com/camox-ai/camox/commit/9a89597310a97606894f59c76e4881ee1d281f69))
* delete project domain and description ([8a1ee2d](https://github.com/camox-ai/camox/commit/8a1ee2d9597fced845ee47c1c917401ae70a0388))
* don't rely on better auth activeOrg for permission checks ([4782674](https://github.com/camox-ai/camox/commit/47826741849674986447e7881b71bcf0709ada7a))
* implement better-auth cross domain plugin internally ([080603d](https://github.com/camox-ai/camox/commit/080603df0970e359b80d631c917adce0e8c4c0f7))
* init hono app ([e442467](https://github.com/camox-ai/camox/commit/e442467809df7cb05ba7df7ae7688ab1e6aed048))
* make web app query new hono api ([ed5e638](https://github.com/camox-ai/camox/commit/ed5e6388e54df1ee5fc1a18402b8ed71c6a4798e))
* migrate definitions sync to orpc ([dfa6b90](https://github.com/camox-ai/camox/commit/dfa6b90013ad1e0efcfb460d1fd8c50af48c4024))
* migrate from hono rpc to orpc ([08d8c77](https://github.com/camox-ai/camox/commit/08d8c772446a33029026dd4e2fa7e1ec539a47eb))
* migrate sdk auth actions to hono api ([0754ad4](https://github.com/camox-ai/camox/commit/0754ad43546920272e0d33e7b0ccb6cffdba0161))
* move seed out of api and into script file ([17b66ae](https://github.com/camox-ai/camox/commit/17b66ae4e7685066c5c8edcbaedd523c5c445a8e))
* normalize page response ([9bc2516](https://github.com/camox-ai/camox/commit/9bc25164f9dab8f8536a36202451fb771e5e7765))
* prefix all query keys with camox ([9801630](https://github.com/camox-ai/camox/commit/9801630df2e2123c7b4a2ed53b7190ae5e79c804))
* prepare for release ([9fb2efa](https://github.com/camox-ai/camox/commit/9fb2efac1b96e715704be8a31ebbc4d23aa63e1a))
* release main ([10f2404](https://github.com/camox-ai/camox/commit/10f24049b5d4797fdb825efb831b9591f5c85973))
* remove BETTER_AUTH_URL en var ([af1dd17](https://github.com/camox-ai/camox/commit/af1dd17161357ca1b2a384bbbd5fcf0a14680cf0))
* rewrite api routes to full rpc style ([dc87be9](https://github.com/camox-ai/camox/commit/dc87be9fa37b42543122c4fbd1d8cd5c21c08a98))
* **sdk:** migrate mutations to new api ([76b6aae](https://github.com/camox-ai/camox/commit/76b6aaeb1d3a0e105219cfa39ce31797ac4c011d))
* **sdk:** migrate read operations to hono api ([b588e8e](https://github.com/camox-ai/camox/commit/b588e8e9769e172ff743ea982a850c8adfc9c6cf))
* seed individual tanstack cache queries ([d89ab96](https://github.com/camox-ai/camox/commit/d89ab96f47273efa1f62584447719948093b66ea))
* set up web app for cloudflare workers ([86a8eeb](https://github.com/camox-ai/camox/commit/86a8eeb8c9088d4310c4f5bd8bfa24e5e292822c))
* use org id instead of slug ([648f80e](https://github.com/camox-ai/camox/commit/648f80eb588468ce1c85c381bfab7a0b6bf7d5c7))

## [0.2.0-alpha.5](https://github.com/camox-ai/camox/compare/camox-v0.2.0-alpha.4...@camox/api-v0.2.0-alpha.5) (2026-04-10)


### Bug Fixes

* release ci ([ee13241](https://github.com/camox-ai/camox/commit/ee132414d0b302238439511f0744171a56e28286))
