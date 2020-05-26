# Drivine User Guide

Drivine is a graph database driver for Node.js and TypeScript implemented on top of the NestJS platform. It is designed to support multiple graph databases (simultaneously, if you wish) and to scale to hundreds or thousands of transactions per second. It allows you to meet these goals without compromising architectural integrity.

Drivine provides a sweet-spot level of abstraction, with management and object to graph mapping (OGM) features. This includes the following:

* Manages infrastructure concerns, such as obtaining and releasing connections and sessions.
* Facilitates implementation of repositories, which can be injected into services. Your code adheres to single responsibility principle (SRP).
* Supports declarative, decorator-driven transactions.
* Supports streaming.
* Maps and transforms query results onto typed entities or models. Drivine makes an important distinction with regards to its mapping approach. This will be detailed in this guide.


Want it fast? Clone the [starter template](https://github.com/liberation-data/drivine-inspiration) and start hacking. 
