// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

contract ReviewRegressions {
    bool private gate;

    modifier ignore(bool value) { _; }

    function flip() internal { gate = false; }

    function laterIteration(address payable target) external {
        for (bool first = true; ; first = false) {
            if (!first) {
                target.send(1);
                break;
            }
        }
    }

    function laterMissingCheck(address payable target) external {
        for (bool first = true; ; first = false) {
            bool ok = target.send(1);
            if (first) require(ok);
            else break;
        }
    }

    function afterHelper(address payable target) external {
        gate = true;
        flip();
        if (!gate) target.send(1);
    }

    function header(address payable target) external ignore(target.send(1)) {}

    function shortCircuit(address payable target, bool flag) external {
        bool ok;
        if (flag && (ok = target.send(1))) {}
        else return;
    }

    function exhaustive(address target, bool flag) external {
        (bool ok,) = target.call("");
        if (!ok && flag) revert();
        if (!ok && !flag) revert();
    }
}

contract InitializerRegression {
    bool private value = payable(address(1)).send(1);
    function f() external {}
}

contract BaseRegression {
    constructor(bool value) {}
}

contract ConstructorRegression is BaseRegression {
    constructor(address payable target) BaseRegression(target.send(1)) {}
}
