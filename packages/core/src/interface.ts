export interface Message<T> {
  id: string;
  timestamps: number;
  data: T;
}

export interface MessageBody<T> {
  // options?: O;
  service: string;
  body: T;
}

export interface EncodedMessage<T> extends Message<T> {}

export interface DecodedMessage<T> extends Message<MessageBody<T>> {}

export interface MessageError extends Error {
  errcode: number;
  errmessage: string;
}

export interface ErrorMessage extends Message<MessageError> {}

export type MessageCallback<T> = (error: MessageError | null, originMessage: EncodedMessage<T>) => void

export type PostMessage = <Input>(message: EncodedMessage<Input>) => void;

export type OnMessage = <Output>(callback: MessageCallback<Output>) => void;

export interface IRPCChannel<Config> {
  readonly config?: Config;
  postMessage: PostMessage;
  onMessage: OnMessage;
}

export interface IRPCChannelClientSide<Config> extends IRPCChannel<Config> {
  useEngine?(callback: (config: Config, message: EncodedMessage<any>) => Promise<EncodedMessage<any>>): void;
}

export interface IRPCChannelServerSide<Config> extends IRPCChannel<Config> {
  middleware?(): (...args: any) => void;
}

export interface MessageHandler {
  encodeMessage<Visible, Unvisible = string>(message: DecodedMessage<Visible>): EncodedMessage<Unvisible>;
  decodeMessage<Visible, Unvisible = string>(message: EncodedMessage<Unvisible>): DecodedMessage<Visible>; 
}

export interface IRPCOptions {
  onMessageEncrypt?(decodedData: string): string;
  onMessageDecrypt?(encodedData: string): string;
}

export interface IRPCClientCostructor<Config> {
  new (channel: IRPCChannelClientSide<Config>, options?: IRPCOptions): IRPCClient<Config>;
}

export interface IRPCClient<Config> extends MessageHandler {
  connect(): Promise<any>;
  consume<Input, Output>(service: string, input: Input): Promise<Output>;
  consume<Input, Output>(service: string, input: Input, callback: (output: Output) => void): void;
}

export type ServiceHandlerCallback<T> = (error: MessageError | null, output: T) => void;

export type CallbackServiceHandler<Input, Output> = (input: Input, callback: ServiceHandlerCallback<Output>) => void;

export type PromiseServiceHandler<Input, Output> = (input: Input) => Promise<Output>;

// export type ServiceHandler<Input = any, Output = any> = PromiseServiceHandler<Input, Output> | CallbackServiceHandler<Input, Output>;

export interface IRPCServerCostructor<Config> {
  new (channel: IRPCChannelServerSide<Config>, options?: IRPCOptions): IRPCServer<Config>;
}

export interface IRPCServer<Config> extends MessageHandler {
  register<Input, Output>(service: string, handler: PromiseServiceHandler<Input, Output>): Output;
  register<Input, Output>(service: string, handler: CallbackServiceHandler<Input, Output>): void;
  discover<Input = any, Output = any>(service: string): CallbackServiceHandler<Input, Output>;
  consume<T>(message: DecodedMessage<T>): void;
  middleware?(): (...args: any) => void;
  prepare(): Promise<Config>
}