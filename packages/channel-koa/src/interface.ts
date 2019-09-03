import { Message } from '@zorpc/core';
export interface Config {
  appKey: string;
}

export interface Connection {
  protocol: string;
  host: string;
  port: number;
  path: string;
  method: 'POST';
}

export interface IClientConfig extends Connection, Config {
    headers?: Record<string, string>;
}

export interface IServerConfig extends Connection, Config {

}

export interface PassMessage<I> extends Config, Message<I> {

}
