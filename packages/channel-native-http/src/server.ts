import {
  IRPCChannelServerSide,
  MessageCallback,
  Message,
} from '@zorpc/core';
import { IncomingMessage, ServerResponse } from 'http';
import { IServerConfig, PassMessage } from './interface';

export class Server implements IRPCChannelServerSide<IServerConfig> {
  private server = {
    consumers: {},
    postMessage(output: Message<any>) {
      this.useCallback(output);
    },
    onmessage(message: Message<any>): void {
      throw new Error(`Server Override onMessage`);
    },
    createCallback<Output>(id: string, consumer: (output: Output) => void, done: Function) {
      this.consumers[id] = (output: Output) => {
        consumer(output);
        // consume only once
        delete this.consumers[id];
      };

      done();
    },
    useCallback(message: Message<any>) {
      const consumeOnlyOnceCallback = this.consumers[message.id];

      if (!consumeOnlyOnceCallback) {
        throw new Error(`CallbackFor(${message.id}) doesnot exist. Maybe it have been consumed ?`)
      }

      consumeOnlyOnceCallback(JSON.stringify(message));
    },
  };

  constructor(public readonly config: IServerConfig) {}

  public postMessage<Output>(output: Message<Output>): void {
    // @LOGGER need a logger: send message to client
    // console.log(`[server] send message: ${JSON.stringify(output)}`);
    this.server.postMessage(output);
  }

  public onMessage<Input>(callback: MessageCallback<Input>) {
    // override onMessage
    this.server.onmessage = (input: PassMessage<any>) => {
      // @LOGGER need a logger: receive message from client
      // console.log(`[server] receive message: ${JSON.stringify(input)}`);
      callback(null, input);
    };
  }

  public middleware() {
    const { method } = this.config;
    return (request: IncomingMessage, response: ServerResponse): any => {
      if (request.method !== method) {
        response.destroy();
        return ;
      }

      let rawBody = '';
      request.on('data', (chunk: Buffer) => {
        rawBody += chunk.toString();
      });

      request.on('end', () => {
        const data = JSON.parse(rawBody);
        
        const callback = (bodyStr) => {
          // should set content type header: application/json
          response.setHeader('Content-Type', 'application/json');
          // then send body string
          response.end(bodyStr);
        };
        this.server.createCallback(data.id, callback, () => {
          this.server.onmessage(data);
        });
      });
    }
  }
}