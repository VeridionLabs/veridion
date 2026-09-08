// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

// Synthetic acceptance examples. Compilation does not deploy these contracts.
contract AcceptanceExamples {
    function ignoredCall(address target, bytes calldata data) external {
        target.call(data);
    }

    function ignoredSend(address payable target, uint256 amount) external {
        target.send(amount);
    }

    function ignoredDelegatecall(address target, bytes calldata data) external {
        target.delegatecall(data);
    }

    function overwrittenResult(address first, address second) external {
        (bool ok,) = first.call("");
        (ok,) = second.call("");
        require(ok, "Second call failed");
    }

    function optionalCheck(address target, bool inspectResult) external {
        (bool ok,) = target.call("");
        if (inspectResult) require(ok);
    }

    function nonLiteralComparison(address target, bool trueFlag) external {
        (bool ok,) = target.call("");
        require(ok == trueFlag);
    }

    function checkedCall(address target, bytes calldata data) external {
        (bool ok,) = target.call(data);
        require(ok, "Call failed");
    }

    function checkedSend(address payable target, uint256 amount) external {
        require(target.send(amount), "Send failed");
    }

    function checkedDelegatecall(address target, bytes calldata data) external {
        (bool ok,) = target.delegatecall(data);
        if (!ok) revert("Delegatecall failed");
    }

    function nativeTransfer(address payable target, uint256 amount) external {
        target.transfer(amount);
    }

    function checkedLoop(address target, uint256 count) external {
        for (uint256 i = 0; i < count; i++) {
            (bool ok,) = target.call("");
            require(ok);
        }
    }
}
