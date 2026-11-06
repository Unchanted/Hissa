// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20Like {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title Deliberately exercisable test spender
/// @notice Anyone can call drain(). This exists only to demonstrate that an allowance
///         becomes spendable once the owner is funded. It says nothing about whether any
///         real production spender has the same path.
contract TestSpender {
    event Drained(address indexed token, address indexed from, address indexed to, uint256 value);

    function drain(address token, address from, address to, uint256 value) external {
        require(IERC20Like(token).transferFrom(from, to, value), "transferFrom failed");
        emit Drained(token, from, to, value);
    }
}
