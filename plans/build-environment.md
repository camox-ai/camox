The main goal behind the concept of environments is to avoid leaking data between one dev's experiments (e.g. mutating a block's content schema) and production, and to ensure the definitions sync matches the blocks and layout files the app is actually running with, whether in dev or prod.

Currently running a build assumes the production environment, which is not correct.

So, how should environments should work? Within the camox vite plugin:

- when dev server starts:
  - The vite plugin finds a ~/.camox/auth.json on your computer. uses email to deduct env name, and searches for it in the db. Creates it if it doesn't exist (from scratch using initial data, not forking production as we can't guarantee schemas will match). Then syncs definitions for that environment
  - No ~/.camox/auth.json: throw an error prompting to run `npx camox login` so they can get their personal dev environment on the Camox API
- on build:
  - if no CAMOX_ENV passed: error the build, prompting to pass CAMOX_ENV to the command. If ~/.camox/auth.json exists on the machine, suggest CAMOX_ENV=<dev-env-name> to run against their dev env, or if they're actually trying to release, CAMOX_ENV=production
  - if environment can't be found: explain that CAMOX_ENV should only be production, or their personal dev env created by running the dev server while being authenticated (and if we detect they're not, give them npx camox login again)
  - if environment is resolved, run the definition sync logic against it, and in the logs make it clear which env we're syncing to.

maybe camox apps should come with a separate script in their package.json that helps users set up deployment on vercel/netlify/workers etc? or maybe docs and explicit errors are enough if it's not one size fits all.

And about environment names. Currently the name is the first part of the email adress (before @). Instead it should be dev:full@email.com, with the trigger in EnvironmentMenu component only showing "DEV"
