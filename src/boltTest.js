import neo4j from "neo4j-driver";
import { HttpRequest }  from "@aws-sdk/protocol-http";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import crypto from "@aws-crypto/sha256-js";
const { Sha256 } = crypto;
import assert from "node:assert";

const region = "ap-southeast-2";
const serviceName = "neptune-db";
const host = "db-neptune-2-instance-1.cokvzz862p37.ap-southeast-2.neptune.amazonaws.com";
const port = 8182;
const protocol = "bolt";
const hostPort = host + ":" + port;
const url = protocol + "://" + hostPort;
const createQuery = "CREATE (n:Greeting {message: 'Hello'}) RETURN ID(n)";
const readQuery = "MATCH(n:Greeting) WHERE ID(n) = $id RETURN n.message";

async function signedHeader() {
    const req = new HttpRequest({
        method: "GET",
        protocol: protocol,
        hostname: host,
        port: port,
        // Comment out the following line if you're using an engine version older than 1.2.0.0
        path: "/opencypher",
        headers: {
            host: hostPort
        }
    });

    const signer = new SignatureV4({
        credentials: defaultProvider(),
        region: region,
        service: serviceName,
        sha256: Sha256
    });

    return signer.sign(req, { unsignableHeaders: new Set(["x-amz-content-sha256"]) })
        .then((signedRequest) => {
            const authInfo = {
                "Authorization": signedRequest.headers["authorization"],
                "HttpMethod": signedRequest.method,
                "X-Amz-Date": signedRequest.headers["x-amz-date"],
                "Host": signedRequest.headers["host"],
                "X-Amz-Security-Token": signedRequest.headers["x-amz-security-token"]
            };
            return JSON.stringify(authInfo);
        });
}

async function createDriver() {
    let authToken = { scheme: "basic", realm: "realm", principal: "username", credentials: await signedHeader() };

    return neo4j.driver(url, authToken, {
            encrypted: "ENCRYPTION_ON",
            trust: "TRUST_SYSTEM_CA_SIGNED_CERTIFICATES",
            maxConnectionPoolSize: 1,
            // logging: neo4j.logging.console("debug")
        }
    );
}

function unmanagedTxn(driver) {
    const session = driver.session();
    const tx = session.beginTransaction();
    tx.run(createQuery)
        .then((res) => {
            const id = res.records[0].get(0);
            return tx.run(readQuery, { id: id });
        })
        .then((res) => {
            // All good, the transaction will be committed
            const msg = res.records[0].get("n.message");
            assert.equal(msg, "Hello");
        })
        .catch(err => {
            // The transaction will be rolled back, now handle the error.
            console.log(err);
        })
        .then(() => session.close());
}

createDriver()
    .then((driver) => {
        unmanagedTxn(driver);
        driver.close();
    })
    .catch((err) => {
        console.log(err);
    });