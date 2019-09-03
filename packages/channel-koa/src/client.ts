import {
  IRPCChannelClientSide,
  MessageCallback,
  Message,
  EncodedMessage,
} from '@zorpc/core';

import { IClientConfig } from './interface';

export class Client implements IRPCChannelClientSide<IClientConfig> {
  private engine: (config: IClientConfig, message: EncodedMessage<any>) => Promise<EncodedMessage<any>>;
  private callback: MessageCallback<any>;

  constructor(public readonly config: IClientConfig) {}

  public postMessage<I>(clientMessage: Message<I>): void {
    const { appKey } = this.config;
    const message = {
      appKey,
      ...clientMessage,
    };

    this.engine(this.config, message)
      .then(serverMessage => {
        this.callback(null, serverMessage);
      }).catch(error => {
        this.callback(error, clientMessage);
      });
  }

  public onMessage<Output>(callback: MessageCallback<Output>) {
    this.callback = (error, message) => {
      callback(error, message);
    };
  }

  public useEngine(callback: (config: IClientConfig, message: EncodedMessage<any>) => Promise<EncodedMessage<any>>): void {
    this.engine = (config, message) => {
      return callback(config, message);
    }
  }
}