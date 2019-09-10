import * as http from 'http';
import * as WsServer from 'socket.io';
import * as rpc from '@zorpc/core';
import * as channels from '@zorpc/channel-socket.io';
import { encrypt, decrypt } from '@zodash/crypto/lib/aes';

const rpcChannel = new channels.Client({
  protocol: 'http',
  host: '127.0.0.1',
  port: 18080,
  event: 'zorpc',
  appKey: '666',
});

const rpcClient = new rpc.RPCClient(rpcChannel, {
  onMessageDecrypt(message: string) {
    return decrypt('aes-256-cfb', '15681121457910001568112145791000', '1568112115681121', message);
  },
  onMessageEncrypt(message: string) {
    return encrypt('aes-256-cfb', '15681121457910001568112145791000', '1568112115681121', message);
  },
});

rpcClient
  .connect()
  .then(() => {
    rpcClient.consume('health', null).then((result) => {
      console.log(`is health: `, result);
    });

    rpcClient.consume('github', 'whatwewant').then((result: any) => {
      console.log(`github: ${result.name} followers: ${result.followers} following: ${result.following}`);
    });

    rpcClient.consume('github', 'sindresorhus').then((result: any) => {
      console.log(`github: ${result.name} followers: ${result.followers} following: ${result.following}`);
    });
  });
