// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

contract GuardRegressions {
    bool private ok;

    function helper() internal {}
    function overwrite() internal { ok = true; }

    function namedReturn(address target) external returns (bool result) {
        (result,) = target.call("");
        helper();
        require(result);
    }

    function shadowedStorage(address target) external {
        (ok,) = target.call("");
        { bool ok = false; overwrite(); }
        require(ok);
    }

    function shadowedLocal(address target) external {
        (bool ok,) = target.call("");
        { bool ok = false; helper(); }
        require(ok);
    }

    function literalGuard(address payable target, bool flag) external {
        bool success;
        if ((flag && (success = target.send(1))) == true) {}
        else return;
    }

    function loopInvariant(address payable target) external {
        bool keep = true;
        for (bool first = true;; first = false) {
            if (!keep) target.send(1);
            keep = true;
            if (!first) break;
        }
    }
}
