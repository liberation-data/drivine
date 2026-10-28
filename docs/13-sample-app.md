## The Sample App

[`sample/`](../sample) is the port of drivine4j's sample: an issue tracker and a guide's users, with fragments, views,
relationship fragments, polymorphic users, property bags, stamps and search. `SampleAppModule.forDatabase(name)` wires
Drivine as an application would, and `sample/test` runs drivine4j's sample tests on every store: the DSL, grouped reads,
patches, label polymorphism, required relationships, deletes and search.
