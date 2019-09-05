import {
  IRPCChannelServerSide,
  MessageCallback,
  Message,
  MessageError,
} from '@zorpc/core';
import { Socket } from 'socket.io';
import { IServerConfig, PassMessage } from './interface';

export class Server implements IRPCChannelServerSide<IServerConfig> {
  private receiveMessage: Function;
  private readonly callbacks = {};

  constructor(public readonly config: IServerConfig) {}

  public postMessage<Output>(message: Message<Output>): void {
    // @LOGGER need a logger: send message to client
    this.useCallback(message);
  }

  public onMessage<Input>(callback: MessageCallback<Input>) {
    this.receiveMessage = (input: Message<any>) => {
      callback(null, input);
    };
  }

  public middleware() {
    const { event } = this.config;
    return (client: Socket, next: Function) => {
      client.on(event, (input) => {
        this.createCallback(
          input.id,
          (output: Message<any>) => {
            client.emit(event, output);
          },
          () => {
            this.receiveMessage(input);
          },
        );
      });

      next();
    }
  }

  private createCallback<O>(id: string, callback: (output: O) => void, done: Function) {
    this.callbacks[id] = (output: O) => {
      callback(output);
      delete this.callbacks[id]; // consume only once
    };

    done();
  }

  private useCallback(data: Message<any>) {
    const consumeOnlyOnceCallback = this.callbacks[data.id];

    if (!consumeOnlyOnceCallback) {
      throw new Error(`CallbackFor(${data.id}) doesnot exist. Maybe it have been consumed ?`);
    }

    consumeOnlyOnceCallback(data)
  }
}
