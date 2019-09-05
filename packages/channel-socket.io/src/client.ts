import {
  IRPCChannelClientSide,
  MessageCallback,
  Message,
  EncodedMessage,
} from '@zorpc/core';

import { IClientConfig } from './interface';

export class Client implements IRPCChannelClientSide<IClientConfig> {
  private engine: (config: IClientConfig, message: EncodedMessage<any>) => Promise<EncodedMessage<any>>;
  private receiveMessage: MessageCallback<any>;

  constructor(public readonly config: IClientConfig) {}

  public postMessage<Input>(clientMessage: Message<Input>): void {
    const { appKey, event } = this.config;
    const message = {
      appKey,
      ...clientMessage,
    };

    this.engine(this.config, message)
      .then(serverMessage => {
        this.receiveMessage(null, serverMessage);
      }).catch(error => {
        this.receiveMessage(error, clientMessage);
      });
  }

  public onMessage<Output>(callback: MessageCallback<Output>) {
    this.receiveMessage = (error, message) => {
      callback(error, message);
    };
  }

  public useEngine(callback: (config: IClientConfig, message: EncodedMessage<any>) => Promise<EncodedMessage<any>>): void {
    this.engine = (config, message) => {
      // @NOTICE should only use once
      // 1.socket.emit
      // 2.socket.on => socket.off
      //
      // example:
      //
      // callback = (config: IClientConfig, message: EncodedMessage<any>) => {
      //   return new Promise((resolve, reject) => {
      //     socket.emit(event, message);
        
      //     function receiveMessage(data) {
      //       socket.off(event, receiveMessage);
      //       resolve(data);
      //     }

      //     function receiveError(error) {
      //       socket.off('error', receiveError);
      //       reject(error);
      //     }

      //     socket.on(event, receiveMessage);

      //     socket.on('error', receiveError);
      //   });
      // }
      return callback(config, message);
    }
  }
}