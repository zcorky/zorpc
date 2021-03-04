import {
  IRPCChannelClientSide,
  MessageCallback,
  Message,
  EncodedMessage,
} from '@zorpc/core';

import { ipcRenderer } from 'electron';
import { CHANNELS } from './constants';
import { IClientConfig } from './interface';

export class Client implements IRPCChannelClientSide<IClientConfig> {
  constructor(public readonly config: IClientConfig) {}

  public postMessage<I>(message: Message<I>): void {
    ipcRenderer.send(CHANNELS.REGISTER_EVENT, message);
  }

  public onMessage<Output>(callback: MessageCallback<Output>) {
    ipcRenderer.on(CHANNELS.FIRE_EVENT, (event, message) => {
      callback(null, message);
    });
  }
}