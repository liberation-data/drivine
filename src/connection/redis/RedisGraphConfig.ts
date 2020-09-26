export type RedisConnectionFamily = 4 | 6;

export interface RedisGraphConfig {
    graphName: string;
    host?: string;
    port?: number;
    family?: RedisConnectionFamily;
    db?: number;
}
