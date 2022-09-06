import { ethers } from "ethers";

import { Providers } from "../types/providers";

export interface ITransactionsService {
  wait(txHash: string): Promise<ethers.providers.TransactionReceipt>;
}

export class TransactionsService implements ITransactionsService {
  constructor(private readonly _providers: Providers) {}

  public async wait(
    txHash: string
  ): Promise<ethers.providers.TransactionReceipt> {
    const provider = new ethers.providers.Web3Provider(
      this._providers.ethereumProvider
    );

    return provider.waitForTransaction(txHash);
  }
}
