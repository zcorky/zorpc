import {
  IRPCChannelServerSide,
  MessageCallback,
  Message,
} from '@zorpc/core';
import { ipcMain, WebContents } from 'electron';

import { IServerConfig } from './interface';
import { CHANNELS } from './constants';

export class Server implements IRPCChannelServerSide<IServerConfig> {
  senders: Record<string, WebContents> = {};
  constructor(public readonly config: IServerConfig) {}

  public postMessage<Output>(message: Message<Output>): void {
    const { id } = message;
    console.log('send message:', id);

    const sender = this.senders[message.id];
    delete this.senders[message.id];

    return sender.send(CHANNELS.FIRE_EVENT, message);
  }

  public onMessage<Input>(callback: MessageCallback<Input>) {
    ipcMain.on(CHANNELS.REGISTER_EVENT, async (event, message) => {
      const { id } = message;
      console.log('receive message:', id);
      
      this.senders[id] = event.sender;

      callback(null, message);
    });
  }
}