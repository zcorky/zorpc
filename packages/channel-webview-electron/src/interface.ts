import { Message } from '@zorpc/core';
export interface Config {
  appKey?: string;
}

export interface IClientConfig extends Config {
    
}

export interface IServerConfig extends Config {

}

export interface PassMessage<I> extends Config, Message<I> {

}
