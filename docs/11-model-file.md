## The Model File

`drivine model` writes `.drivine/model.json` beside your `package.json`: your fragments, relationship fragments and
views, and how each is stored, in the [format](https://github.com/liberation-data/drivine-cypher-spec/tree/main/model)
drivine4j and drivine-python write too. [Drivine Studio](https://github.com/liberation-data/drivine-studio) reads it to
browse your model and load it, with the Cypher `loadAll` runs, without your application running.

```sh
npx drivine model                       # reads ./tsconfig.json
npx drivine model --project tsconfig.app.json
npx drivine model --check               # writes nothing; fails when the file is not current, for CI
```

It reads your source with your project's own TypeScript compiler, rather than loading your classes, since a field no
decorator marks leaves nothing at run time: so it needs `typescript` installed, and runs none of your code. Each
class's id is its file's path from the package and its name, `src/fragments/Person#Person`. A decorator's arguments
are read as the compiler can tell them: literals, constants, enum members, and `() => Class`. It names what it can't
read, such as a label a function gives, and any class Drivine would refuse when it loads it, and leaves that class out
of the file.

Keep the file in source control, as you would a lock file: a change to the model shows in review, Studio can read it
straight from your repository, and `--check` in CI says when it is stale. A class you remove stays in the file, marked
`"removed": true`, as the store may still hold its nodes; delete the entry by hand once it does not. The file is
written only when it changes. `"drivine": { "model": false }` in `package.json` turns it off.

TypeScript can't say all the format can: a `number` is written as a `float`, an id held as a `string` as a `string`,
and a field's nullness as `"unknown"` without `strictNullChecks`. An `@EmptyWhenAbsent` list TypeScript records as Object,
such as `string[] | null` or `Set<string> | null`, loads as `{}` when absent unless its kind is named: it is named, and
written as the list it is declared. A kind that contradicts the type TypeScript records is refused, as a load refuses it.

The sample app's file is [`sample/.drivine/model.json`](../sample/.drivine/model.json).
