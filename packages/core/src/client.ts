import { uuid } from '@zodash/uuid';
import {
  IRPCClient,
  IRPCOptions,
  IRPCChannelClientSide,
  MessageError,
  DecodedMessage,
  EncodedMessage,
} from './interface';

const HEALTH_SERVICE = 'health';

export class RPCClient<Config> implements IRPCClient<Config> {
  private isHealthy: boolean = false;
  private consumers: Record<string, (output: any) => void> = {};

  constructor(
    private readonly channel: IRPCChannelClientSide<Config>,
    private readonly options: IRPCOptions = {},
  ) {
    
  }

  public async connect() {
    // if already connect, it is not necessary to do health check
    if (this.isHealthy) {
      return ;
    }

    // 1 mount listener
    this.mountMessageListener();

    // 2 consume health service
    this.isHealthy = await this.consume(HEALTH_SERVICE, null);
    if (this.isHealthy !== true) {
      throw new Error(`Connect Serveice Center Failed ! Please Check and Try again.`);
    }
  }

  public consume<Input, Output>(service: string, input: Input): Promise<Output>
  public consume<Input, Output>(service: string, input: Input, callback: (output: Output) => void): void
  public consume<Input, Output>(service: any, input: Input, callback?: any): any {
    if (!this.isHealthy && service !== HEALTH_SERVICE) {
      throw new Error(`Service Center is not ready. Please Connect first or Check what's wrong ?`);
    }

    const message = this.createMessage(service, input);

    if (typeof callback === 'function') {
      return this.createCallback<any>(message.id, callback, () => {
        this.channel.postMessage(message);
      });
    }

    return new Promise<Output>((resolve, reject) => {
      const callback = (output: Output) => {
        // @TODO ERROR MESSAGE RESPONSE
        if (output && (output as any).errcode) {
          const error = new Error((output as any).errmessage) as MessageError;
          error.errcode = (output as any).errcode
          error.errmessage = (output as any).errmessage;
          // `[${(output as any).errcode}] ${(output as any).errmessage}`
          return reject(error);
        }
        
        resolve(output);
      };

      this.createCallback<any>(message.id, callback, () => {
          this.channel.postMessage(message);
        },
      );
    });
  }

  private mountMessageListener() {
    this.channel.onMessage((error, rawServerMessage) => {
      try {
        // parse message
        const serverMessage = this.decodeMessage(rawServerMessage);

        if (!serverMessage || !serverMessage.id || !serverMessage.data) {
          throw new Error(`Invalid Message, or without id, data`);
        }

        if (error) {
          return this.onError(error, serverMessage);
        }

        // call callback
        this.useCallback(serverMessage);
      } catch (error) {
        // @TODO
        return this.onError(error, {
          id: rawServerMessage.id,
          timestamps: rawServerMessage.timestamps,
          data: {
            service: 'broken',
            body: null,
          },
        });
      }
    });
  }

  private createCallback<O>(id: string, consumeOutput: (output: O) => void, done: Function) {
    this.consumers[id] = (output: O) => {
      consumeOutput(output);
      delete this.consumers[id]; // consume only once
    };

    done();
  }

  private useCallback(message: DecodedMessage<any>) {
    const consumeOutputOnlyOnceCallback = this.consumers[message.id];

    if (!consumeOutputOnlyOnceCallback) {
      throw new Error(`CallbackFor(${message.data.service}_${message.id}) doesnot exist. Maybe it have been consumed ?`);
    }

    consumeOutputOnlyOnceCallback(message.data.body)
  }

  private createMessage<Input>(service: string, body: Input) {
    const id = uuid();
    const rawClientMessage = {
      id,
      timestamps: Date.now(),
      data: {
        service,
        body,
      },
    };

    const clientMessage = this.encodeMessage(rawClientMessage);
    return clientMessage;
  }

  private restoreMessage<Output>(serverMessage: DecodedMessage<Output>, body: Output): DecodedMessage<Output> {
    const clientMessage = {
      id: serverMessage.id,
      timestamps: Date.now(),
      data: {
        service: serverMessage.data.service,
        body,
      },
    };

    return clientMessage;
  }

  private onError<T>(error: MessageError, serverMessage: DecodedMessage<any>) {
    const { errcode = 500, errmessage, message } = error;
    const serverErrorMessage = this.restoreMessage(serverMessage, {
      errcode,
      errmessage: errmessage || message,
    });

    // consume in callback
    this.useCallback(serverErrorMessage);
  }

  public encodeMessage<Visible>(message: DecodedMessage<Visible>): EncodedMessage<any> {
    let encodedMessage = message as any as EncodedMessage<string>;

    if (this.options.onMessageEncrypt) {
      const strified = JSON.stringify(message.data);

      encodedMessage = {
        id: message.id,
        timestamps: message.timestamps,
        data: this.options.onMessageEncrypt(strified),
      };
    }

    return encodedMessage;
  }

  public decodeMessage<Visible>(message: EncodedMessage<any>): DecodedMessage<Visible> {
    let decodedMessage = message as any as DecodedMessage<Visible>;

    if (this.options.onMessageDecrypt) {
      const strigified = this.options.onMessageDecrypt(message.data);
      
      decodedMessage = {
        id: message.id,
        timestamps: message.timestamps,
        data: JSON.parse(strigified),
      };
    }

    return decodedMessage;
  }
}