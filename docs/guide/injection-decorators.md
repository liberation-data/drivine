# Injection Decorators

You can inject resources that are defined in a separate file. The idea is that in a complex application these can have a lifecycle in their own right. For example, a separately defined query can be formatted, profiled and tested using IDE tooling, then simply injected where needed. 

## InjectCypher

Injects a cypher statement that has `.cypher` extension.

The first argument is the directory name, second is the resource name.  

```
@InjectCypher(__dirname, 'routesBetween') readonly routesBetween: string
```

If you have a TypeScript path alias set up, you can also inject cleanly as follows: 

```
@InjectCypher('@/traffic/routesBetween') readonly routesBetween: string
```

where the path will automatically be translated to the full filesystem path by the path alias system. 

## InjectSql

Injects an SQL statement that has `.sql` extension.

The first argument is the directory name, second is the resource name.  

```
@InjectCypher(__dirname, 'routesBetween') readonly routesBetween: string
```

If you have a TypeScript path alias set up, you can also inject cleanly as follows: 

```
@InjectCypher('@/traffic/routesBetween') readonly routesBetween: string
```

where the path will automatically be translated to the full filesystem path by the path alias system. 


## InjectFileContents

Injects the contents of a file, for example: 

```
@InjectFileContents(__dirname, 'someTextFile.txt') readonly text: string
```
