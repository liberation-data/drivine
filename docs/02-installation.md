## Installation

```bash
npm install @liberation-data/drivine
```

Drivine needs `reflect-metadata` and `neo4j-driver` as peer dependencies, and NestJS (6 to 11) only for its module. The
FalkorDB, Oracle (`oracledb`, thin mode, no Instant Client needed) and Postgres drivers are bundled.

The object manager reads decorators and their type metadata, so enable both in `tsconfig.json`:

```json
{
    "compilerOptions": {
        "experimentalDecorators": true,
        "emitDecoratorMetadata": true
    }
}
```
