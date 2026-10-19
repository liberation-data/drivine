import * as net from 'net';
import { DatabaseType } from '@liberation-data/drivine';
import { DrivineTestContainers, Environment } from '@/testing';

/** Sends PING to the Redis protocol at the address, and resolves with the reply. */
async function ping(host: string, port: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket: net.Socket = net.connect(port, host, () => socket.write('PING\r\n'));
        socket.once('data', (data: Buffer) => {
            socket.end();
            resolve(data.toString().trim());
        });
        socket.once('error', reject);
    });
}

describe('DrivineTestContainers, with Docker', () => {
    it('starts one container for the datasources of a type, and points each of them at it', async () => {
        const env: Environment = {
            FALKORDB_DATABASE_TYPE: 'FALKORDB',
            FALKORDB_DATABASE_HOST: 'nowhere',
            FALKORDB_DATABASE_PORT: '1',
            FALKORDB_DATABASE_NAME: 'one',
            OTHER_DATABASE_TYPE: 'FALKORDB',
            OTHER_DATABASE_HOST: 'nowhere',
            OTHER_DATABASE_NAME: 'two'
        };
        const containers = await DrivineTestContainers.start(env);
        try {
            expect([...containers.started.keys()]).toEqual([DatabaseType.FALKORDB]);
            expect(env.OTHER_DATABASE_HOST).toEqual(env.FALKORDB_DATABASE_HOST);
            expect(env.OTHER_DATABASE_PORT).toEqual(env.FALKORDB_DATABASE_PORT);
            expect(env.FALKORDB_DATABASE_PORT).not.toEqual('1');
            // A graph's name is the datasource's own: the container doesn't fix it.
            expect(env.OTHER_DATABASE_NAME).toEqual('two');
            expect(await ping(env.FALKORDB_DATABASE_HOST!, Number(env.FALKORDB_DATABASE_PORT))).toEqual('+PONG');
        } finally {
            await containers.stop();
        }
    }, 120_000);
});
