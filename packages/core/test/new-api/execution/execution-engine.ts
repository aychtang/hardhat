import { assert } from "chai";

import { Artifact, FutureType } from "../../../src";
import { defineModule } from "../../../src/new-api/define-module";
import { MemoryJournal } from "../../../src/new-api/internal/journal/memory-journal";
import {
  DeployContractStartMessage,
  JournalableMessage,
} from "../../../src/new-api/types/journal";
import {
  accumulateMessages,
  assertDeploymentFailure,
  assertDeploymentSuccess,
  exampleAccounts,
  setupDeployerWithMocks,
} from "../helpers";

describe("execution engine", () => {
  const exampleAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const differentAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  const accounts = exampleAccounts;
  const txId = "0x123";
  const diffTxId = "0x456";

  const contractWithThreeArgConstructorArtifact = {
    abi: [
      {
        type: "constructor",
        stateMutability: "payable",
        inputs: [
          {
            name: "_first",
            type: "string",
            internalType: "string",
          },
          {
            name: "_second",
            type: "string",
            internalType: "string",
          },
          {
            name: "_third",
            type: "string",
            internalType: "string",
          },
        ],
      },
    ],
    contractName: "Contract1",
    bytecode: "",
    linkReferences: {},
  };

  it("should execute a contract deploy", async () => {
    const journal = new MemoryJournal();

    const moduleDefinition = defineModule("Module1", (m) => {
      const account1 = m.getAccount(1);
      const supply = m.getParameter("supply", 1000);

      const contract1 = m.contract(
        "Contract1",
        [account1, supply, { nested: supply }],
        { from: account1 }
      );

      return { contract1 };
    });

    const deployer = setupDeployerWithMocks({
      journal,
      artifacts: {
        Contract1: contractWithThreeArgConstructorArtifact,
      },
      transactionResponses: {
        [accounts[1]]: {
          0: {
            blockNumber: 0,
            confirmations: 1,
            contractAddress: exampleAddress,
            transactionHash: txId,
          },
        },
      },
    });

    const result = await deployer.deploy(
      moduleDefinition,
      {
        Module1: { supply: 2000 },
      },
      exampleAccounts
    );

    assertDeploymentSuccess(result, {
      "Module1:Contract1": {
        contractName: "Contract1",
        contractAddress: exampleAddress,
        storedArtifactPath: "Module1:Contract1.json",
      },
    });

    const journalMessages = await accumulateMessages(journal);

    assert.deepStrictEqual(journalMessages, [
      {
        futureId: "Module1:Contract1",
        type: "execution-start",
        futureType: FutureType.NAMED_CONTRACT_DEPLOYMENT,
        strategy: "basic",
        dependencies: [],
        storedArtifactPath: "Module1:Contract1.json",
        storedBuildInfoPath: "build-info-12345.json",
        contractName: "Contract1",
        value: BigInt(0).toString(),
        constructorArgs: [
          "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
          2000,
          { nested: 2000 },
        ],
        libraries: {},
        from: accounts[1],
      },
      {
        type: "onchain-action",
        subtype: "deploy-contract",
        futureId: "Module1:Contract1",
        executionId: 1,
        contractName: "Contract1",
        args: [
          "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
          2000,
          { nested: 2000 },
        ],
        value: BigInt(0).toString(),
        storedArtifactPath: "Module1:Contract1.json",
        from: accounts[1],
      },
      {
        type: "onchain-transaction-request",
        futureId: "Module1:Contract1",
        executionId: 1,
        from: accounts[1],
        nonce: 0,
        tx: {
          _kind: "TEST-TRANSACTION",
          nonce: 0,
        },
      },
      {
        type: "onchain-transaction-accept",
        futureId: "Module1:Contract1",
        executionId: 1,
        txHash: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC--0",
      },
      {
        type: "onchain-result",
        subtype: "deploy-contract-success",
        futureId: "Module1:Contract1",
        executionId: 1,
        contractAddress: exampleAddress,
        txId,
      },
      {
        type: "execution-success",
        subtype: "deploy-contract",
        futureId: "Module1:Contract1",
        contractName: "Contract1",
        contractAddress: exampleAddress,
        txId,
      },
    ]);
  });

  it("should record a reverted contract deploy", async () => {
    const moduleDefinition = defineModule("Module1", (m) => {
      const account1 = m.getAccount(1);
      const contract1 = m.contract("Contract1", [], { from: account1 });

      return { contract1 };
    });

    const journal = new MemoryJournal();

    const deployer = setupDeployerWithMocks({
      journal,
      sendErrors: {
        [accounts[1]]: {
          0: () => {
            const error = new Error("");
            (error as any).reason =
              "Cannot estimate gas; transaction may fail or may require manual gas limit";
            throw error;
          },
        },
      },
    });

    const result = await deployer.deploy(moduleDefinition, {}, exampleAccounts);

    assertDeploymentFailure(result, {
      "Module1:Contract1": new Error(
        "Cannot estimate gas; transaction may fail or may require manual gas limit"
      ),
    });

    const journalMessages = await accumulateMessages(journal);

    assert.deepStrictEqual(journalMessages, [
      {
        futureId: "Module1:Contract1",
        type: "execution-start",
        futureType: FutureType.NAMED_CONTRACT_DEPLOYMENT,
        strategy: "basic",
        dependencies: [],
        storedArtifactPath: "Module1:Contract1.json",
        storedBuildInfoPath: "build-info-12345.json",
        contractName: "Contract1",
        value: BigInt(0).toString(),
        constructorArgs: [],
        libraries: {},
        from: accounts[1],
      },
      {
        type: "onchain-action",
        subtype: "deploy-contract",
        futureId: "Module1:Contract1",
        executionId: 1,
        contractName: "Contract1",
        args: [],
        value: BigInt(0).toString(),
        from: accounts[1],
        storedArtifactPath: "Module1:Contract1.json",
      },
      {
        type: "onchain-transaction-request",
        futureId: "Module1:Contract1",
        executionId: 1,
        from: accounts[1],
        nonce: 0,
        tx: {
          _kind: "TEST-TRANSACTION",
          nonce: 0,
        },
      },
      {
        type: "execution-failure",
        futureId: "Module1:Contract1",
        error: new Error(
          "Cannot estimate gas; transaction may fail or may require manual gas limit"
        ),
      },
    ]);
  });

  it("should execute a library deploy", async () => {
    const moduleDefinition = defineModule("Module1", (m) => {
      const account2 = m.getAccount(2);
      const library1 = m.library("Library1", { from: account2 });

      return { library1 };
    });

    const journal = new MemoryJournal();

    const deployer = setupDeployerWithMocks({
      journal,
      transactionResponses: {
        [accounts[2]]: {
          0: {
            blockNumber: 0,
            confirmations: 1,
            contractAddress: exampleAddress,
            transactionHash: txId,
          },
        },
      },
    });

    const result = await deployer.deploy(moduleDefinition, {}, exampleAccounts);

    assertDeploymentSuccess(result, {
      "Module1:Library1": {
        contractName: "Library1",
        storedArtifactPath: "Module1:Library1.json",
        contractAddress: exampleAddress,
      },
    });

    const journalMessages = await accumulateMessages(journal);

    assert.deepStrictEqual(journalMessages, [
      {
        futureId: "Module1:Library1",
        type: "execution-start",
        futureType: FutureType.NAMED_LIBRARY_DEPLOYMENT,
        strategy: "basic",
        dependencies: [],
        storedArtifactPath: "Module1:Library1.json",
        storedBuildInfoPath: "build-info-12345.json",
        contractName: "Library1",
        value: BigInt(0).toString(),
        constructorArgs: [],
        libraries: {},
        from: accounts[2],
      },
      {
        type: "onchain-action",
        subtype: "deploy-contract",
        futureId: "Module1:Library1",
        executionId: 1,
        contractName: "Library1",
        args: [],
        value: BigInt(0).toString(),
        storedArtifactPath: "Module1:Library1.json",
        from: accounts[2],
      },
      {
        type: "onchain-transaction-request",
        futureId: "Module1:Library1",
        executionId: 1,
        from: accounts[2],
        nonce: 0,
        tx: {
          _kind: "TEST-TRANSACTION",
          nonce: 0,
        },
      },
      {
        type: "onchain-transaction-accept",
        futureId: "Module1:Library1",
        executionId: 1,
        txHash: "0x90F79bf6EB2c4f870365E785982E1f101E93b906--0",
      },
      {
        type: "onchain-result",
        subtype: "deploy-contract-success",
        futureId: "Module1:Library1",
        executionId: 1,
        contractAddress: exampleAddress,
        txId,
      },
      {
        type: "execution-success",
        subtype: "deploy-contract",
        futureId: "Module1:Library1",
        contractName: "Library1",
        contractAddress: exampleAddress,
        txId,
      },
    ]);
  });

  it("should execute an artifact contract deploy", async () => {
    const fakeArtifact: Artifact = {
      abi: [],
      contractName: "Contract1",
      bytecode: "",
      linkReferences: {},
    };

    const moduleDefinition = defineModule("Module1", (m) => {
      const account2 = m.getAccount(2);
      const contract1 = m.contractFromArtifact("Contract1", fakeArtifact, [], {
        from: account2,
      });

      return { contract1 };
    });

    const journal = new MemoryJournal();

    const deployer = setupDeployerWithMocks({
      journal,
      transactionResponses: {
        [accounts[2]]: {
          0: {
            blockNumber: 0,
            confirmations: 1,
            contractAddress: exampleAddress,
            transactionHash: txId,
          },
        },
      },
    });

    const result = await deployer.deploy(moduleDefinition, {}, exampleAccounts);

    assertDeploymentSuccess(result, {
      "Module1:Contract1": {
        contractName: "Contract1",
        storedArtifactPath: "Module1:Contract1.json",
        contractAddress: exampleAddress,
      },
    });

    const journalMessages = await accumulateMessages(journal);

    assert.deepStrictEqual(journalMessages, [
      {
        futureId: "Module1:Contract1",
        type: "execution-start",
        futureType: FutureType.ARTIFACT_CONTRACT_DEPLOYMENT,
        strategy: "basic",
        dependencies: [],
        storedArtifactPath: "Module1:Contract1.json",
        contractName: "Contract1",
        value: BigInt(0).toString(),
        constructorArgs: [],
        libraries: {},
        from: accounts[2],
      } as Omit<
        DeployContractStartMessage,
        "storedBuildInfoPath"
      > as any as JournalableMessage,
      {
        type: "onchain-action",
        subtype: "deploy-contract",
        futureId: "Module1:Contract1",
        executionId: 1,
        contractName: "Contract1",
        args: [],
        value: BigInt(0).toString(),
        from: accounts[2],
        storedArtifactPath: "Module1:Contract1.json",
      },
      {
        type: "onchain-transaction-request",
        futureId: "Module1:Contract1",
        executionId: 1,
        from: accounts[2],
        nonce: 0,
        tx: {
          _kind: "TEST-TRANSACTION",
          nonce: 0,
        },
      },
      {
        type: "onchain-transaction-accept",
        futureId: "Module1:Contract1",
        executionId: 1,
        txHash: "0x90F79bf6EB2c4f870365E785982E1f101E93b906--0",
      },
      {
        type: "onchain-result",
        subtype: "deploy-contract-success",
        futureId: "Module1:Contract1",
        executionId: 1,
        contractAddress: exampleAddress,
        txId,
      },
      {
        type: "execution-success",
        subtype: "deploy-contract",
        futureId: "Module1:Contract1",
        contractName: "Contract1",
        contractAddress: exampleAddress,
        txId,
      },
    ]);
  });

  describe("send data", () => {
    it("should execute a send data", async () => {
      const journal = new MemoryJournal();

      const moduleDefinition = defineModule("Module1", (m) => {
        const account1 = m.getAccount(1);

        const contract1 = m.contract("Contract1", [], { from: account1 });

        m.send("test-send", contract1, 123n, undefined, { from: account1 });

        return { contract1 };
      });

      const deployer = setupDeployerWithMocks({
        journal,
        transactionResponses: {
          [accounts[1]]: {
            0: {
              blockNumber: 0,
              confirmations: 1,
              contractAddress: exampleAddress,
              transactionHash: txId,
            },
            1: {
              blockNumber: 1,
              confirmations: 1,
              transactionHash: diffTxId,
            },
          },
        },
      });

      const result = await deployer.deploy(
        moduleDefinition,
        {},
        exampleAccounts
      );

      assertDeploymentSuccess(result, {
        "Module1:Contract1": {
          contractName: "Contract1",
          contractAddress: exampleAddress,
          storedArtifactPath: "Module1:Contract1.json",
        },
      });

      const journalMessages = await accumulateMessages(journal);

      assert.deepStrictEqual(journalMessages, [
        {
          futureId: "Module1:Contract1",
          type: "execution-start",
          futureType: FutureType.NAMED_CONTRACT_DEPLOYMENT,
          strategy: "basic",
          dependencies: [],
          storedArtifactPath: "Module1:Contract1.json",
          storedBuildInfoPath: "build-info-12345.json",
          contractName: "Contract1",
          value: BigInt(0).toString(),
          constructorArgs: [],
          libraries: {},
          from: accounts[1],
        },
        {
          type: "onchain-action",
          subtype: "deploy-contract",
          futureId: "Module1:Contract1",
          executionId: 1,
          contractName: "Contract1",
          args: [],
          value: BigInt(0).toString(),
          storedArtifactPath: "Module1:Contract1.json",
          from: accounts[1],
        },
        {
          type: "onchain-transaction-request",
          futureId: "Module1:Contract1",
          executionId: 1,
          from: accounts[1],
          nonce: 0,
          tx: {
            _kind: "TEST-TRANSACTION",
            nonce: 0,
          },
        },
        {
          type: "onchain-transaction-accept",
          futureId: "Module1:Contract1",
          executionId: 1,
          txHash: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC--0",
        },
        {
          type: "onchain-result",
          subtype: "deploy-contract-success",
          futureId: "Module1:Contract1",
          executionId: 1,
          contractAddress: exampleAddress,
          txId,
        },
        {
          type: "execution-success",
          subtype: "deploy-contract",
          futureId: "Module1:Contract1",
          contractName: "Contract1",
          contractAddress: exampleAddress,
          txId,
        },
        {
          type: "execution-start",
          futureType: FutureType.SEND_DATA,
          futureId: "Module1:test-send",
          strategy: "basic",
          dependencies: ["Module1:Contract1"],
          data: "0x",
          from: accounts[1],
          to: exampleAddress,
          value: "123",
        },
        {
          type: "onchain-action",
          subtype: "send-data",
          futureId: "Module1:test-send",
          data: "0x",
          executionId: 1,
          from: accounts[1],
          to: exampleAddress,
          value: "123",
        },
        {
          type: "onchain-transaction-request",
          futureId: "Module1:test-send",
          executionId: 1,
          from: accounts[1],
          nonce: 1,
          tx: {
            from: accounts[1],
            nonce: 1,
            to: exampleAddress,
            data: "0x",
            value: BigInt(123),
          },
        },
        {
          type: "onchain-transaction-accept",
          futureId: "Module1:test-send",
          executionId: 1,
          txHash: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC--1",
        },
        {
          type: "onchain-result",
          subtype: "send-data-success",
          futureId: "Module1:test-send",
          executionId: 1,
          txId: diffTxId,
        },
        {
          type: "execution-success",
          subtype: "send-data",
          futureId: "Module1:test-send",
          txId: diffTxId,
        },
      ]);
    });

    it.skip("should record a revert of send data");
  });

  describe("call function", () => {
    it("should execute a call", async () => {
      const journal = new MemoryJournal();

      const moduleDefinition = defineModule("Module1", (m) => {
        const account1 = m.getAccount(1);

        const contract1 = m.contract("Contract1", [], { from: account1 });

        m.call(contract1, "configure", [1, "b", false], { from: account1 });

        return { contract1 };
      });

      const deployer = setupDeployerWithMocks({
        journal,
        transactionResponses: {
          [accounts[1]]: {
            0: {
              blockNumber: 0,
              confirmations: 1,
              contractAddress: exampleAddress,
              transactionHash: txId,
            },
            1: {
              blockNumber: 1,
              confirmations: 1,
              transactionHash: diffTxId,
            },
          },
        },
      });

      const result = await deployer.deploy(
        moduleDefinition,
        {},
        exampleAccounts
      );

      assertDeploymentSuccess(result, {
        "Module1:Contract1": {
          contractName: "Contract1",
          contractAddress: exampleAddress,
          storedArtifactPath: "Module1:Contract1.json",
        },
      });

      const journalMessages = await accumulateMessages(journal);

      assert.deepStrictEqual(journalMessages, [
        {
          futureId: "Module1:Contract1",
          type: "execution-start",
          futureType: FutureType.NAMED_CONTRACT_DEPLOYMENT,
          strategy: "basic",
          dependencies: [],
          storedArtifactPath: "Module1:Contract1.json",
          storedBuildInfoPath: "build-info-12345.json",
          contractName: "Contract1",
          value: BigInt(0).toString(),
          constructorArgs: [],
          libraries: {},
          from: accounts[1],
        },
        {
          type: "onchain-action",
          subtype: "deploy-contract",
          futureId: "Module1:Contract1",
          executionId: 1,
          contractName: "Contract1",
          args: [],
          value: BigInt(0).toString(),
          storedArtifactPath: "Module1:Contract1.json",
          from: accounts[1],
        },
        {
          type: "onchain-transaction-request",
          futureId: "Module1:Contract1",
          executionId: 1,
          from: accounts[1],
          nonce: 0,
          tx: {
            _kind: "TEST-TRANSACTION",
            nonce: 0,
          },
        },
        {
          type: "onchain-transaction-accept",
          futureId: "Module1:Contract1",
          executionId: 1,
          txHash: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC--0",
        },
        {
          type: "onchain-result",
          subtype: "deploy-contract-success",
          futureId: "Module1:Contract1",
          executionId: 1,
          contractAddress: exampleAddress,
          txId,
        },
        {
          type: "execution-success",
          subtype: "deploy-contract",
          futureId: "Module1:Contract1",
          contractName: "Contract1",
          contractAddress: exampleAddress,
          txId,
        },
        {
          type: "execution-start",
          futureType: FutureType.NAMED_CONTRACT_CALL,
          futureId: "Module1:Contract1#configure",
          strategy: "basic",
          dependencies: ["Module1:Contract1"],
          args: [1, "b", false],
          contractAddress: exampleAddress,
          from: accounts[1],
          functionName: "configure",
          storedArtifactPath: "Module1:Contract1.json",
          value: "0",
        },
        {
          type: "onchain-action",
          subtype: "call-function",
          args: [1, "b", false],
          contractAddress: exampleAddress,
          executionId: 1,
          functionName: "configure",
          futureId: "Module1:Contract1#configure",
          storedArtifactPath: "Module1:Contract1.json",
          from: accounts[1],
          value: "0",
        },
        {
          type: "onchain-transaction-request",
          futureId: "Module1:Contract1#configure",
          executionId: 1,
          from: accounts[1],
          nonce: 1,
          tx: {
            _kind: "TEST-CALL-TRANSACTION",
            nonce: 1,
          },
        },
        {
          type: "onchain-transaction-accept",
          futureId: "Module1:Contract1#configure",
          executionId: 1,
          txHash: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC--1",
        },
        {
          type: "onchain-result",
          subtype: "call-function-success",
          futureId: "Module1:Contract1#configure",
          executionId: 1,
          txId: diffTxId,
        },
        {
          type: "execution-success",
          subtype: "call-function",
          futureId: "Module1:Contract1#configure",
          contractAddress: exampleAddress,
          functionName: "configure",
          txId: diffTxId,
        },
      ]);
    });

    it.skip("should record a revert of call function");
  });

  describe("static call", () => {
    it("should execute a static call", async () => {
      const journal = new MemoryJournal();

      const moduleDefinition = defineModule("Module1", (m) => {
        const account1 = m.getAccount(1);

        const contract1 = m.contract("Contract1", [], { from: account1 });

        m.staticCall(contract1, "test", [1, "b", false], { from: account1 });

        return { contract1 };
      });

      const deployer = setupDeployerWithMocks({
        journal,
        transactionResponses: {
          [accounts[1]]: {
            0: {
              blockNumber: 0,
              confirmations: 1,
              contractAddress: exampleAddress,
              transactionHash: txId,
            },
          },
        },
        staticCall: async (contractAddress, _abi, functionName) => {
          assert.equal(contractAddress, exampleAddress);
          assert.equal(functionName, "test");

          return "example_static_call_result";
        },
      });

      const result = await deployer.deploy(
        moduleDefinition,
        {},
        exampleAccounts
      );

      assertDeploymentSuccess(result, {
        "Module1:Contract1": {
          contractName: "Contract1",
          contractAddress: exampleAddress,
          storedArtifactPath: "Module1:Contract1.json",
        },
      });

      const journalMessages = await accumulateMessages(journal);

      assert.deepStrictEqual(journalMessages, [
        {
          futureId: "Module1:Contract1",
          type: "execution-start",
          futureType: FutureType.NAMED_CONTRACT_DEPLOYMENT,
          strategy: "basic",
          dependencies: [],
          storedArtifactPath: "Module1:Contract1.json",
          storedBuildInfoPath: "build-info-12345.json",
          contractName: "Contract1",
          value: BigInt(0).toString(),
          constructorArgs: [],
          libraries: {},
          from: accounts[1],
        },
        {
          type: "onchain-action",
          subtype: "deploy-contract",
          futureId: "Module1:Contract1",
          executionId: 1,
          contractName: "Contract1",
          args: [],
          value: BigInt(0).toString(),
          storedArtifactPath: "Module1:Contract1.json",
          from: accounts[1],
        },
        {
          type: "onchain-transaction-request",
          futureId: "Module1:Contract1",
          executionId: 1,
          from: accounts[1],
          nonce: 0,
          tx: {
            _kind: "TEST-TRANSACTION",
            nonce: 0,
          },
        },
        {
          type: "onchain-transaction-accept",
          futureId: "Module1:Contract1",
          executionId: 1,
          txHash: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC--0",
        },
        {
          type: "onchain-result",
          subtype: "deploy-contract-success",
          futureId: "Module1:Contract1",
          executionId: 1,
          contractAddress: exampleAddress,
          txId,
        },
        {
          type: "execution-success",
          subtype: "deploy-contract",
          futureId: "Module1:Contract1",
          contractName: "Contract1",
          contractAddress: exampleAddress,
          txId,
        },
        {
          type: "execution-start",
          futureType: FutureType.NAMED_STATIC_CALL,
          futureId: "Module1:Contract1#test",
          strategy: "basic",
          dependencies: ["Module1:Contract1"],
          args: [1, "b", false],
          contractAddress: exampleAddress,
          from: accounts[1],
          functionName: "test",
          storedArtifactPath: "Module1:Contract1.json",
        },
        {
          type: "onchain-action",
          subtype: "static-call",
          args: [1, "b", false],
          contractAddress: exampleAddress,
          executionId: 1,
          functionName: "test",
          futureId: "Module1:Contract1#test",
          storedArtifactPath: "Module1:Contract1.json",
          from: accounts[1],
        },
        {
          type: "onchain-result",
          subtype: "static-call-success",
          futureId: "Module1:Contract1#test",
          executionId: 1,
          result: "example_static_call_result",
        },
        {
          type: "execution-success",
          subtype: "static-call",
          futureId: "Module1:Contract1#test",
          contractAddress: exampleAddress,
          functionName: "test",
          result: "example_static_call_result",
        },
      ]);
    });

    it.skip("should record a revert of call function");
  });

  describe("contract at", () => {
    it("should execute a contract at", async () => {
      const journal = new MemoryJournal();

      const moduleDefinition = defineModule("Module1", (m) => {
        const contract1 = m.contractAt("Contract1", exampleAddress);

        return { contract1 };
      });

      const deployer = setupDeployerWithMocks({
        journal,
      });

      const result = await deployer.deploy(
        moduleDefinition,
        {},
        exampleAccounts
      );

      assertDeploymentSuccess(result, {
        "Module1:Contract1": {
          contractName: "Contract1",
          contractAddress: exampleAddress,
          storedArtifactPath: "Module1:Contract1.json",
        },
      });

      const journalMessages = await accumulateMessages(journal);

      assert.deepStrictEqual(journalMessages, [
        {
          type: "execution-start",
          futureType: FutureType.NAMED_CONTRACT_AT,
          futureId: "Module1:Contract1",
          strategy: "basic",
          contractAddress: exampleAddress,
          contractName: "Contract1",
          dependencies: [],
          storedArtifactPath: "Module1:Contract1.json",
          storedBuildInfoPath: "build-info-12345.json",
        },
        {
          type: "onchain-action",
          subtype: "contract-at",
          futureId: "Module1:Contract1",
          executionId: 1,
          contractAddress: exampleAddress,
          contractName: "Contract1",
          storedArtifactPath: "Module1:Contract1.json",
        },
        {
          type: "execution-success",
          subtype: "contract-at",
          futureId: "Module1:Contract1",
          contractName: "Contract1",
          contractAddress: exampleAddress,
        },
      ]);
    });
  });

  describe("read event arg", () => {
    it("should execute a read event arg", async () => {
      const journal = new MemoryJournal();

      const moduleDefinition = defineModule("Module1", (m) => {
        const account1 = m.getAccount(1);

        const contract1 = m.contract("Contract1", [], { from: account1 });

        m.readEventArgument(contract1, "EventName1", "arg1");

        return { contract1 };
      });

      const deployer = setupDeployerWithMocks({
        journal,
        transactionResponses: {
          [accounts[1]]: {
            0: {
              blockNumber: 0,
              confirmations: 1,
              contractAddress: exampleAddress,
              transactionHash: txId,
              logs: { here: "example" },
            },
          },
        },
        getEventArgument: async (
          eventName: string,
          argumentName: string,
          txToReadFrom: string
        ) => {
          assert.equal(eventName, "EventName1");
          assert.equal(argumentName, "arg1");
          assert.equal(txToReadFrom, txId);

          return "event-arg-value";
        },
      });

      const result = await deployer.deploy(
        moduleDefinition,
        {},
        exampleAccounts
      );

      assertDeploymentSuccess(result, {
        "Module1:Contract1": {
          contractName: "Contract1",
          contractAddress: exampleAddress,
          storedArtifactPath: "Module1:Contract1.json",
        },
      });

      const journalMessages = await accumulateMessages(journal);

      assert.deepStrictEqual(journalMessages, [
        {
          futureId: "Module1:Contract1",
          type: "execution-start",
          futureType: FutureType.NAMED_CONTRACT_DEPLOYMENT,
          strategy: "basic",
          dependencies: [],
          storedArtifactPath: "Module1:Contract1.json",
          storedBuildInfoPath: "build-info-12345.json",
          contractName: "Contract1",
          value: BigInt(0).toString(),
          constructorArgs: [],
          libraries: {},
          from: accounts[1],
        },
        {
          type: "onchain-action",
          subtype: "deploy-contract",
          futureId: "Module1:Contract1",
          executionId: 1,
          contractName: "Contract1",
          args: [],
          value: BigInt(0).toString(),
          storedArtifactPath: "Module1:Contract1.json",
          from: accounts[1],
        },
        {
          type: "onchain-transaction-request",
          futureId: "Module1:Contract1",
          executionId: 1,
          from: accounts[1],
          nonce: 0,
          tx: {
            _kind: "TEST-TRANSACTION",
            nonce: 0,
          },
        },
        {
          type: "onchain-transaction-accept",
          futureId: "Module1:Contract1",
          executionId: 1,
          txHash: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC--0",
        },
        {
          type: "onchain-result",
          subtype: "deploy-contract-success",
          futureId: "Module1:Contract1",
          executionId: 1,
          contractAddress: exampleAddress,
          txId,
        },
        {
          type: "execution-success",
          subtype: "deploy-contract",
          futureId: "Module1:Contract1",
          contractName: "Contract1",
          contractAddress: exampleAddress,
          txId,
        },

        {
          type: "execution-start",
          futureType: FutureType.READ_EVENT_ARGUMENT,
          strategy: "basic",
          dependencies: ["Module1:Contract1"],
          futureId: "Module1:Contract1#EventName1#arg1#0",
          eventName: "EventName1",
          argumentName: "arg1",
          eventIndex: 0,
          emitterAddress: exampleAddress,
          txToReadFrom: txId,
          storedArtifactPath: "Module1:Contract1.json",
        },
        {
          type: "onchain-action",
          subtype: "read-event-arg",
          futureId: "Module1:Contract1#EventName1#arg1#0",
          executionId: 1,
          eventName: "EventName1",
          argumentName: "arg1",
          eventIndex: 0,
          emitterAddress: exampleAddress,
          txToReadFrom: txId,
          storedArtifactPath: "Module1:Contract1.json",
        },
        {
          type: "onchain-result",
          subtype: "read-event-arg-success",
          futureId: "Module1:Contract1#EventName1#arg1#0",
          executionId: 1,
          result: "event-arg-value",
        },
        {
          type: "execution-success",
          subtype: "read-event-arg",
          futureId: "Module1:Contract1#EventName1#arg1#0",
          eventName: "EventName1",
          argumentName: "arg1",
          result: "event-arg-value",
        },
      ]);
    });

    it.skip("should record a revert of a read event arg");
  });

  describe("with complex arguments", () => {
    it("should execute deploy when futures are passed as nested arguments", async () => {
      const moduleDefinition = defineModule("Module1", (m) => {
        const account1 = m.getAccount(1);
        const supply = m.getParameter("supply", 1000);

        const library1 = m.library("Library1", { from: account1 });

        const contract1 = m.contract(
          "Contract1",
          [{ nested: library1, arr: [account1, supply] }],
          {
            libraries: {
              Library1: library1,
            },
            from: account1,
          }
        );

        return { library1, contract1 };
      });

      const journal = new MemoryJournal();

      const deployer = setupDeployerWithMocks({
        journal,
        transactionResponses: {
          [accounts[1]]: {
            0: {
              blockNumber: 0,
              confirmations: 1,
              contractAddress: differentAddress,
              transactionHash: txId,
            },
            1: {
              blockNumber: 0,
              confirmations: 1,
              contractAddress: exampleAddress,
              transactionHash: diffTxId,
            },
          },
        },
      });

      const result = await deployer.deploy(
        moduleDefinition,
        {},
        exampleAccounts
      );

      assertDeploymentSuccess(result, {
        "Module1:Contract1": {
          contractName: "Contract1",
          storedArtifactPath: "Module1:Contract1.json",
          contractAddress: exampleAddress,
        },
        "Module1:Library1": {
          contractName: "Library1",
          storedArtifactPath: "Module1:Library1.json",
          contractAddress: differentAddress,
        },
      });

      const journalMessages = await accumulateMessages(journal);

      assert.deepStrictEqual(journalMessages, [
        {
          futureId: "Module1:Library1",
          type: "execution-start",
          futureType: FutureType.NAMED_LIBRARY_DEPLOYMENT,
          strategy: "basic",
          dependencies: [],
          storedArtifactPath: "Module1:Library1.json",
          storedBuildInfoPath: "build-info-12345.json",
          contractName: "Library1",
          value: BigInt(0).toString(),
          constructorArgs: [],
          libraries: {},
          from: accounts[1],
        },
        {
          type: "onchain-action",
          subtype: "deploy-contract",
          futureId: "Module1:Library1",
          executionId: 1,
          contractName: "Library1",
          args: [],
          value: BigInt(0).toString(),
          storedArtifactPath: "Module1:Library1.json",
          from: accounts[1],
        },
        {
          type: "onchain-transaction-request",
          futureId: "Module1:Library1",
          executionId: 1,
          from: accounts[1],
          nonce: 0,
          tx: {
            _kind: "TEST-TRANSACTION",
            nonce: 0,
          },
        },
        {
          type: "onchain-transaction-accept",
          futureId: "Module1:Library1",
          executionId: 1,
          txHash: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC--0",
        },
        {
          type: "onchain-result",
          subtype: "deploy-contract-success",
          futureId: "Module1:Library1",
          executionId: 1,
          contractAddress: differentAddress,
          txId,
        },
        {
          type: "execution-success",
          subtype: "deploy-contract",
          futureId: "Module1:Library1",
          contractName: "Library1",
          contractAddress: differentAddress,
          txId,
        },
        {
          futureId: "Module1:Contract1",
          type: "execution-start",
          futureType: FutureType.NAMED_CONTRACT_DEPLOYMENT,
          strategy: "basic",
          dependencies: ["Module1:Library1"],
          storedArtifactPath: "Module1:Contract1.json",
          storedBuildInfoPath: "build-info-12345.json",
          contractName: "Contract1",
          value: BigInt(0).toString(),
          constructorArgs: [
            {
              arr: ["0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", 1000],
              nested: differentAddress,
            },
          ],
          libraries: {
            Library1: "Module1:Library1",
          },
          from: accounts[1],
        },
        {
          type: "onchain-action",
          subtype: "deploy-contract",
          futureId: "Module1:Contract1",
          executionId: 1,
          contractName: "Contract1",
          args: [
            {
              nested: differentAddress,
              arr: ["0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", 1000],
            },
          ],
          value: BigInt(0).toString(),
          storedArtifactPath: "Module1:Contract1.json",
          from: exampleAccounts[1],
        },
        {
          type: "onchain-transaction-request",
          futureId: "Module1:Contract1",
          executionId: 1,
          from: accounts[1],
          nonce: 1,
          tx: {
            _kind: "TEST-TRANSACTION",
            nonce: 1,
          },
        },
        {
          type: "onchain-transaction-accept",
          futureId: "Module1:Contract1",
          executionId: 1,
          txHash: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC--1",
        },
        {
          type: "onchain-result",
          subtype: "deploy-contract-success",
          futureId: "Module1:Contract1",
          executionId: 1,
          contractAddress: exampleAddress,
          txId: diffTxId,
        },
        {
          type: "execution-success",
          subtype: "deploy-contract",
          futureId: "Module1:Contract1",
          contractName: "Contract1",
          contractAddress: exampleAddress,
          txId: diffTxId,
        },
      ]);
    });
  });
});
