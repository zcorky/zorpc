import {
  IRPCChannelClientSide,
  MessageCallback,
  Message,
  EncodedMessage,
} from '@zorpc/core';
import * as WsClient from 'socket.io-client';

import { IClientConfig } from './interface';

export class Client implements IRPCChannelClientSide<IClientConfig> {
  private socket: SocketIOClient.Socket;

  constructor(public readonly config: IClientConfig) {
    this.socket = WsClient.connect(`${config.protocol}://${config.host}:${config.port}`);
  }

  public postMessage<Input>(clientMessage: Message<Input>): void {
    const { appKey, event } = this.config;
    const message = {
      appKey,
      ...clientMessage,
    };

    this.socket.emit(event, message)
  }

  public onMessage<Output>(callback: MessageCallback<Output>) {
    const { appKey, event } = this.config;
    
    this.socket.on(event, message => {
      callback(null, message);
    });

    this.socket.on('error', error => {
      callback(error, null);
    });
  }

  // public useSocket(socket: SocketIOClient.Socket): void {
  //   console.log(`use Socket`);
  //   this.socket = socket;
  // }
}