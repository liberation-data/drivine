# The model file

A model file says what an application's Drivine model is: its fragments, relationship fragments and views, and how each is stored. Each Drivine library writes one when it builds, from the classes it already reads for its query DSL, and Drivine Studio reads it. With the file, Studio can browse a model, write the Cypher that `loadAll` would run for it, and read what comes back, without the application running.

The file describes what is stored, in Drivine's terms, not in any one language's. It leaves out what only changes how the code holds a value.

`schema.json` is the file's JSON Schema. `examples/sample.json` is drivine4j's sample domain, written out by hand as a library would write it.

## Where it is

A library writes `.drivine/model.json` beside each module's build file (`build.gradle`, `pom.xml`, `package.json`, `pyproject.toml`). A repository with several modules has several files, and Studio reads them all, matching ids across them.

A library writes the file by default, and has a switch to turn it off.

Keep the file in source control, as with a lock file. Studio can then read a repository's model straight from GitHub, with nothing built; a change to the model shows in review as a change to the file; and a build in CI writes it again and fails when it differs from the file committed. A project that would rather not can ignore it in git, and Studio then reads it from a local build.

## Writing it the same way every time

The file changes only when the model does:

- Lists are sorted: fragments, relationship fragments and views by `id`, removed or not; properties by `name`; a view's relationships by `field`. Labels keep the order they are declared in, since the first is the one a node is told by.
- No timestamps, no absolute paths, nothing of the machine that wrote it.
- Two spaces of indentation, keys in the order the schema lists them, and a newline at the end.

## The file

```json
{
  "$comment": "Drivine model file: this module's fragments, relationship fragments and views, written by the build. ...",
  "format": "drivine-model/1",
  "generator": { "library": "drivine4j", "version": "0.4.0", "language": "kotlin" },
  "module": "drivine4j-sample",
  "fragments": [ ... ],
  "relationshipFragments": [ ... ],
  "views": [ ... ]
}
```

| Key | What it is |
|---|---|
| `$comment` | What the file is for, for someone who comes across it: the text in `examples/sample.json`, word for word, whichever library writes it. Not read. |
| `format` | `drivine-model/` and the format's major version. A reader refuses a major version it does not know. Within one, a reader skips keys it does not know, so a library can add one without breaking an older Studio. |
| `generator` | The library that wrote the file, its version, and the language of the classes. Shown, not read. |
| `module` | The module's name, as its build names it. |
| `fragments`, `relationshipFragments`, `views` | What the module declares. Each has an `id`, unique across every model file a reader is given. |

### Ids

An id is the class's fully qualified name in its own language: `org.drivine.sample.fragment.Person`, `sample.fragments.person.Person`, or for TypeScript the module path and class, `src/fragments/Person#Person`. Every reference in the file is an id. Nothing is nested, so a view that refers to itself needs nothing special.

### Removed entries

A fragment, relationship fragment or view that the file had and the code no longer declares stays in the file, marked `"removed": true`, as it last was. The store may still hold nodes and relationships written under it, and a reader shows them as such: Studio greys a removed entry out, rather than leaving a node it cannot name. So a library writes the file from the code and from the file before it.

- An entry that comes back into the code is written from the code again, and is no longer removed.
- An entry stays removed until someone deletes it from the file by hand, once the store holds nothing of it.
- A module whose code declares nothing at all still writes its file, with every entry removed.
- An id that is removed in one module's file and current in another's, as when a class moves, is the current one.

A removed entry may refer to other removed entries, and to current ones. A current entry refers only to current ones.

### Fragments

```json
{
  "id": "org.drivine.sample.fragment.WebUser",
  "name": "WebUser",
  "labels": ["WebUser"],
  "nodeId": "uuid",
  "subtypes": [
    "org.drivine.sample.fragment.AnonymousWebUser",
    "org.drivine.sample.fragment.RegisteredWebUser"
  ],
  "properties": [ ... ]
}
```

| Key | What it is |
|---|---|
| `name` | The class's simple name, for showing. |
| `removed` | The code no longer declares it: see [Removed entries](#removed-entries). Absent means `false`. Every kind of entry may carry it. |
| `labels` | The labels every node of the fragment carries. |
| `nodeId` | The `name` of the `@NodeId` property, or absent. |
| `stamp` | Whether the fragment has a `@NodeStamp` field. Its value is stored under `__drivine.stamp`, whatever the field is called. |
| `subtypes` | The fragments a load of this one may give instead, told apart by their labels. |
| `subtypesComplete` | `false` when the library cannot see every subtype as it builds: a subtype registered in code, as drivine4j's `registerSubtype` does, is not in the file. A reader then also gives the base fragment for a node whose labels match no listed subtype. Absent means `true`. |
| `labelSet` | A `@NodeLabels` field: the node's labels beyond `labels`. `{ "field": "roles", "values": ["Admin", "Author"] }` for a set of an enum, which speaks only for those labels; without `values`, an open set, which reads every label and records the ones it wrote under `__drivine.labels.<field>`. |
| `bags` | `@PropertyBag` fields: `{ "field": "metadata", "prefix": "metadata.", "type": "string" }`, where an entry `source` is the node property `metadata.source`. A `flat` bag has an empty prefix and holds every property nothing else does. `type` is the type of the map's values. |
| `properties` | The fragment's properties. |
| `indexes` | Indexes and constraints over several properties at once: `{ "kind": "unique", "properties": ["tenantId", "userId"] }`. `kind` is `unique`, `range` or `fullText`. |

Every node property whose name starts with `__drivine.` is Drivine's own. A reader shows none of them as data.

### Properties

```json
{ "name": "createdAt", "stored": "created_at", "type": "datetime", "nullable": false, "source": "java.time.Instant" }
```

| Key | What it is |
|---|---|
| `name` | What the code calls it, and what the query DSL names it by. |
| `stored` | The node property it is stored under, which Cypher names it by. It differs from `name` when the property is renamed (`@GraphProperty`), and in drivine-python, which by default stores a field `created_at` as `createdAt`. |
| `type` | One of the types below. |
| `of` | For a `list`, the type of its elements. For a `map`, the type of its values. |
| `values` | For an `enum`, its members, as they are stored. |
| `nullable` | `true`, `false`, or `"unknown"` when the language cannot say, as for a Java field with no nullness annotation. |
| `whenAbsent` | What a load gives when the node has no value: `"default"` for the property's declared default (`@Default`), `"empty"` for an empty list or map (`@EmptyWhenAbsent`). Absent means null. |
| `packed` | `"json"` when the value is stored as one JSON string (`@JsonPacked`). Cypher sees a string. |
| `readOnly` | Loaded, never written. |
| `index` | An index or constraint on this property alone: `unique`, `range`, `text` or `fullText`. |
| `vector` | An embedding (`@VectorIndex`): `{ "similarity": "COSINE" }` or `EUCLIDEAN`, and `dimensions` when the code states them. Most take their dimensions from the embedding model when the application runs, so the file cannot hold them. |
| `source` | The type as the language writes it. Shown, not read. |

#### Types

| `type` | What is stored |
|---|---|
| `string` | Text. |
| `int` | A whole number. |
| `float` | A number with a fraction. |
| `boolean` | True or false. |
| `uuid` | A UUID, stored as its text. |
| `date`, `time`, `localTime`, `datetime`, `localDatetime`, `duration` | openCypher's temporal values. |
| `enum` | A member's name, stored as text; `values` lists them. |
| `list` | A list; `of` is its elements' type. |
| `map` | A map, packed or in a bag; `of` is its values' type. |
| `json` | Any value the library stores as JSON text, packed. |
| `any` | A type the library cannot name. A reader shows it as it comes. |

### Relationship fragments

A `@RelationshipFragment` is a relationship's properties and the node at its far end.

```json
{
  "id": "org.drivine.sample.fragment.WorkHistory",
  "name": "WorkHistory",
  "target": { "field": "target", "fragment": "org.drivine.sample.fragment.Organization" },
  "properties": [ ... ]
}
```

`target.fragment` may be a view's id rather than a fragment's. `properties` are the relationship's, as a fragment's are a node's.

### Views

```json
{
  "id": "org.drivine.sample.view.RaisedAndAssignedIssue",
  "name": "RaisedAndAssignedIssue",
  "root": { "field": "issue", "fragment": "org.drivine.sample.fragment.IssueCore" },
  "relationships": [ ... ],
  "aggregates": [ ... ]
}
```

#### Relationships

```json
{ "field": "assignedTo", "type": "ASSIGNED_TO", "direction": "OUTGOING", "target": "org.drivine.sample.fragment.Person", "many": true, "required": false }
```

| Key | What it is |
|---|---|
| `field` | The view's field. |
| `type` | The relationship type. Absent on a path. |
| `direction` | `OUTGOING`, `INCOMING` or `UNDIRECTED`, from the root. Absent on a path. |
| `target` | The id of a fragment, a view, or a relationship fragment. |
| `many` | A list, rather than one. |
| `required` | A load leaves out a root that has none. |
| `maxDepth` | Above 1, the relationship is followed up to this many times: a view that holds itself, or a list read over several hops. |
| `sortedBy` | `{ "property": "person.name", "ascending": true }`: the library sorts the list once it has read it. |
| `readOnly` | Loaded, never written. A path is always read-only. |
| `path` | A `@GraphPath`, in place of `type` and `direction`: its hops, in order, one or more. |

A hop:

```json
{ "type": "ACTED_IN", "direction": "OUTGOING", "label": "Movie", "orderBy": "released", "ascending": false }
```

`label` constrains the node the hop reaches. `orderBy` names a property of that node, on at most one hop, and the path is read in its order.

#### Aggregates

```json
{ "field": "movieCount", "function": "COUNT", "type": "ACTED_IN", "direction": "OUTGOING" }
```

`function` is `COUNT`, `SUM`, `AVG`, `MIN` or `MAX`. Every one but `COUNT` names the related node's `property`.

## What is left out

- Fields the library does not store (`@GraphTransient`).
- A converter's code, and the value a `@Default` falls back to: a load in Studio shows what is stored.
- Queries, beyond what a view says to load.

## Changing the format

The format is a contract between the three libraries and Studio, as the Cypher spec is. A change lands here first, in a tagged release. A key added within a major version is one an older reader can skip. Anything else is a new major version.
