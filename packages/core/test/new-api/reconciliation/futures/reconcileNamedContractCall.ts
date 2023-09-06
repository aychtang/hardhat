/* eslint-disable import/no-unused-modules */
import { assert } from "chai";

import { buildModule } from "../../../../src/build-module";
import { ExecutionResultType } from "../../../../src/internal/execution/types/execution-result";
import {
  CallExecutionState,
  DeploymentExecutionState,
  ExecutionSateType,
  ExecutionStatus,
} from "../../../../src/internal/execution/types/execution-state";
import { FutureType } from "../../../../src/types/module";
import { exampleAccounts } from "../../helpers";
import {
  assertSuccessReconciliation,
  createDeploymentState,
  oneAddress,
  reconcile,
  twoAddress,
} from "../helpers";

describe("Reconciliation - named contract call", () => {
  const exampleAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const differentAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";

  const exampleDeploymentState: DeploymentExecutionState = {
    id: "Example",
    type: ExecutionSateType.DEPLOYMENT_EXECUTION_STATE,
    futureType: FutureType.NAMED_CONTRACT_DEPLOYMENT,
    strategy: "basic",
    status: ExecutionStatus.STARTED,
    dependencies: new Set<string>(),
    networkInteractions: [],
    artifactId: "./artifact.json",
    contractName: "Contract1",
    value: BigInt("0"),
    constructorArgs: [],
    libraries: {},
    from: exampleAccounts[0],
  };

  const exampleContractCallState: CallExecutionState = {
    id: "Example",
    type: ExecutionSateType.CALL_EXECUTION_STATE,
    futureType: FutureType.NAMED_CONTRACT_CALL,
    strategy: "basic",
    status: ExecutionStatus.STARTED,
    dependencies: new Set<string>(),
    networkInteractions: [],
    contractAddress: differentAddress,
    artifactId: "./artifact.json",
    functionName: "function",
    args: [],
    value: BigInt("0"),
    from: exampleAccounts[0],
  };

  it("should reconcile unchanged", async () => {
    const submoduleDefinition = buildModule("Submodule", (m) => {
      const contract1 = m.contract("Contract1");

      m.call(contract1, "function1", [1, "a", contract1], {});

      return { contract1 };
    });

    const moduleDefinition = buildModule("Module", (m) => {
      const { contract1 } = m.useModule(submoduleDefinition);

      return { contract1 };
    });

    await assertSuccessReconciliation(
      moduleDefinition,
      createDeploymentState(
        {
          ...exampleDeploymentState,
          id: "Submodule:Contract1",
          status: ExecutionStatus.SUCCESS,
          result: {
            type: ExecutionResultType.SUCCESS,
            address: differentAddress,
          },
        },
        {
          ...exampleContractCallState,
          id: "Submodule:Contract1#function1",
          futureType: FutureType.NAMED_CONTRACT_CALL,
          status: ExecutionStatus.SUCCESS,
          functionName: "function1",
          args: [1, "a", differentAddress],
        }
      )
    );
  });

  it("should find changes to contract unreconciliable", async () => {
    const moduleDefinition = buildModule("Module", (m) => {
      const contract1 = m.contract("Contract1");

      m.call(contract1, "function1", [], { id: "config" });

      return { contract1 };
    });

    const reconiliationResult = await reconcile(
      moduleDefinition,
      createDeploymentState(
        {
          ...exampleDeploymentState,
          id: "Module:Contract1",
          status: ExecutionStatus.SUCCESS,
          result: {
            type: ExecutionResultType.SUCCESS,
            address: differentAddress,
          },
        },
        {
          ...exampleContractCallState,
          id: "Module:Contract1#config",
          futureType: FutureType.NAMED_CONTRACT_CALL,
          status: ExecutionStatus.STARTED,
          functionName: "function1",
          contractAddress: exampleAddress,
        }
      )
    );

    assert.deepStrictEqual(reconiliationResult.reconciliationFailures, [
      {
        futureId: "Module:Contract1#config",
        failure:
          "Contract address has been changed from 0x1F98431c8aD98523631AE4a59f267346ea31F984 to 0xBA12222222228d8Ba445958a75a0704d566BF2C8 (future Module:Contract1)",
      },
    ]);
  });

  it("should find changes to function name unreconciliable", async () => {
    const moduleDefinition = buildModule("Module", (m) => {
      const contract1 = m.contract("Contract1");

      m.call(contract1, "functionChanged", [], { id: "config" });

      return { contract1 };
    });

    const reconiliationResult = await reconcile(
      moduleDefinition,
      createDeploymentState(
        {
          ...exampleDeploymentState,
          id: "Module:Contract1",
          status: ExecutionStatus.SUCCESS,
          result: {
            type: ExecutionResultType.SUCCESS,
            address: differentAddress,
          },
        },
        {
          ...exampleContractCallState,
          id: "Module:Contract1#config",
          futureType: FutureType.NAMED_CONTRACT_CALL,
          status: ExecutionStatus.STARTED,
          functionName: "functionUnchanged",
        }
      )
    );

    assert.deepStrictEqual(reconiliationResult.reconciliationFailures, [
      {
        futureId: "Module:Contract1#config",
        failure:
          "Function name has been changed from functionUnchanged to functionChanged",
      },
    ]);
  });

  it("should find changes to function args unreconciliable", async () => {
    const moduleDefinition = buildModule("Module", (m) => {
      const ticker = m.getParameter("ticker", "CHANGED");

      const contract1 = m.contract("Contract1");

      m.call(contract1, "function1", [[ticker]], {});

      return { contract1 };
    });

    const reconiliationResult = await reconcile(
      moduleDefinition,
      createDeploymentState(
        {
          ...exampleDeploymentState,
          id: "Module:Contract1",
          status: ExecutionStatus.SUCCESS,
          result: {
            type: ExecutionResultType.SUCCESS,
            address: differentAddress,
          },
        },
        {
          ...exampleContractCallState,
          id: "Module:Contract1#function1",
          futureType: FutureType.NAMED_CONTRACT_CALL,
          status: ExecutionStatus.STARTED,
          functionName: "function1",
          args: [["UNCHANGED"]],
        }
      )
    );

    assert.deepStrictEqual(reconiliationResult.reconciliationFailures, [
      {
        futureId: "Module:Contract1#function1",
        failure: "Argument at index 0 has been changed",
      },
    ]);
  });

  it("should find changes to value unreconciliable", async () => {
    const moduleDefinition = buildModule("Module", (m) => {
      const contract1 = m.contract("Contract1");

      m.call(contract1, "function1", [], { id: "config", value: BigInt(3) });

      return { contract1 };
    });

    const reconiliationResult = await reconcile(
      moduleDefinition,
      createDeploymentState(
        {
          ...exampleDeploymentState,
          id: "Module:Contract1",
          status: ExecutionStatus.SUCCESS,
          result: {
            type: ExecutionResultType.SUCCESS,
            address: differentAddress,
          },
        },
        {
          ...exampleContractCallState,
          id: "Module:Contract1#config",
          futureType: FutureType.NAMED_CONTRACT_CALL,
          status: ExecutionStatus.STARTED,
          functionName: "function1",
          value: BigInt(2),
        }
      )
    );

    assert.deepStrictEqual(reconiliationResult.reconciliationFailures, [
      {
        futureId: "Module:Contract1#config",
        failure: "Value has been changed from 2 to 3",
      },
    ]);
  });

  it("should find changes to from unreconciliable", async () => {
    const moduleDefinition = buildModule("Module", (m) => {
      const contract1 = m.contract("Contract1");

      m.call(contract1, "function1", [], { id: "config", from: twoAddress });

      return { contract1 };
    });

    const reconiliationResult = await reconcile(
      moduleDefinition,
      createDeploymentState(
        {
          ...exampleDeploymentState,
          id: "Module:Contract1",
          status: ExecutionStatus.SUCCESS,
          result: {
            type: ExecutionResultType.SUCCESS,
            address: differentAddress,
          },
        },
        {
          ...exampleContractCallState,
          id: "Module:Contract1#config",
          futureType: FutureType.NAMED_CONTRACT_CALL,
          status: ExecutionStatus.STARTED,
          functionName: "function1",
          from: oneAddress,
        }
      )
    );

    assert.deepStrictEqual(reconiliationResult.reconciliationFailures, [
      {
        futureId: "Module:Contract1#config",
        failure: `From account has been changed from ${oneAddress} to ${twoAddress}`,
      },
    ]);
  });
});
