// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SplitEscrow
 * @notice Escrow contract for splitting a bill among several participants (Splitwise on-chain).
 *         Each "split group" aggregates who owes whom. Debtors deposit the ERC-20 token
 *         into the contract; once everyone has paid, settlement automatically transfers the
 *         amounts to the respective creditors.
 *
 *         Flow:
 *         1. The agent creates a group with debtors, creditors and amounts (createSplit).
 *         2. Each debtor approves the token and calls deposit() to pay their share.
 *         3. Once everyone has deposited, anyone can call settle() to liquidate.
 *         4. Immutable events are emitted at each step for historical record.
 *
 * @dev Works with any ERC-20 token (on Pharos we use the test USDC).
 *      Kept intentionally simple and auditable for hackathon purposes.
 */
contract SplitEscrow {
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    /// @notice A payment obligation: `from` owes `amount` to `to`.
    struct Debt {
        address from;   // debtor
        address to;     // creditor
        uint256 amount; // amount owed (in token units)
        bool paid;      // whether the debtor has deposited their share
    }

    /// @notice A bill-split group.
    struct Split {
        address creator;     // who created the group (usually the agent)
        address token;       // ERC-20 token address used for settlement
        uint256 deadline;    // deadline timestamp for everyone to pay
        uint256 totalDebts;  // total number of obligations in the group
        uint256 paidDebts;   // how many obligations have been paid
        bool settled;        // whether the group has been settled
        bool exists;         // existence marker
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    /// @notice Incremental group ID counter.
    uint256 public nextSplitId;

    /// @notice splitId => group data.
    mapping(uint256 => Split) public splits;

    /// @notice splitId => list of obligations.
    mapping(uint256 => Debt[]) public debts;

    // ------------------------------------------------------------------
    // Events (immutable on-chain record)
    // ------------------------------------------------------------------

    event SplitCreated(
        uint256 indexed splitId,
        address indexed creator,
        address token,
        uint256 totalDebts,
        uint256 deadline
    );

    event Deposited(
        uint256 indexed splitId,
        uint256 indexed debtIndex,
        address indexed from,
        address to,
        uint256 amount
    );

    event Settled(
        uint256 indexed splitId,
        uint256 totalTransferred,
        uint256 timestamp
    );

    // ------------------------------------------------------------------
    // Custom errors (cheaper than require strings)
    // ------------------------------------------------------------------

    error SplitDoesNotExist();
    error AlreadySettled();
    error DeadlinePassed();
    error InvalidDebtIndex();
    error DebtAlreadyPaid();
    error NotTheDebtor();
    error NotAllPaid();
    error TokenTransferFailed();
    error EmptyDebts();
    error ZeroAmount();

    // ------------------------------------------------------------------
    // Minimal ERC-20 interface (avoids external dependencies)
    // ------------------------------------------------------------------

    function _transferFrom(address token, address from, address to, uint256 amount) private {
        // selector of transferFrom(address,address,uint256)
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, to, amount)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    function _transfer(address token, address to, uint256 amount) private {
        // selector of transfer(address,uint256)
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, amount)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    // ------------------------------------------------------------------
    // Main functions
    // ------------------------------------------------------------------

    /**
     * @notice Create a new split group with the list of obligations.
     * @param token   ERC-20 token address used to settle.
     * @param froms   List of debtors.
     * @param tos     List of creditors (same index as `froms`).
     * @param amounts List of amounts owed (same index).
     * @param duration Duration in seconds until the payment deadline.
     * @return splitId The identifier of the newly created group.
     */
    function createSplit(
        address token,
        address[] calldata froms,
        address[] calldata tos,
        uint256[] calldata amounts,
        uint256 duration
    ) external returns (uint256 splitId) {
        uint256 n = froms.length;
        if (n == 0) revert EmptyDebts();
        require(n == tos.length && n == amounts.length, "length mismatch");

        splitId = nextSplitId++;

        Split storage s = splits[splitId];
        s.creator = msg.sender;
        s.token = token;
        s.deadline = block.timestamp + duration;
        s.totalDebts = n;
        s.paidDebts = 0;
        s.settled = false;
        s.exists = true;

        for (uint256 i = 0; i < n; i++) {
            if (amounts[i] == 0) revert ZeroAmount();
            debts[splitId].push(Debt({
                from: froms[i],
                to: tos[i],
                amount: amounts[i],
                paid: false
            }));
        }

        emit SplitCreated(splitId, msg.sender, token, n, s.deadline);
    }

    /**
     * @notice A debtor deposits their share into the escrow.
     * @dev    The caller must have approved this contract on the token beforehand.
     * @param splitId   Group ID.
     * @param debtIndex Index of the obligation within the group.
     */
    function deposit(uint256 splitId, uint256 debtIndex) external {
        Split storage s = splits[splitId];
        if (!s.exists) revert SplitDoesNotExist();
        if (s.settled) revert AlreadySettled();
        if (block.timestamp > s.deadline) revert DeadlinePassed();
        if (debtIndex >= debts[splitId].length) revert InvalidDebtIndex();

        Debt storage d = debts[splitId][debtIndex];
        if (d.paid) revert DebtAlreadyPaid();
        if (msg.sender != d.from) revert NotTheDebtor();

        // Pull the amount from the debtor into the contract (escrow).
        _transferFrom(s.token, msg.sender, address(this), d.amount);

        d.paid = true;
        s.paidDebts += 1;

        emit Deposited(splitId, debtIndex, d.from, d.to, d.amount);
    }

    /**
     * @notice Settle the group once ALL obligations have been paid.
     *         Transfers each creditor the amount deposited in their favor.
     * @param splitId Group ID.
     */
    function settle(uint256 splitId) external {
        Split storage s = splits[splitId];
        if (!s.exists) revert SplitDoesNotExist();
        if (s.settled) revert AlreadySettled();
        if (s.paidDebts != s.totalDebts) revert NotAllPaid();

        // Mark as settled BEFORE the transfers (reentrancy protection).
        s.settled = true;

        uint256 totalTransferred = 0;
        Debt[] storage list = debts[splitId];
        for (uint256 i = 0; i < list.length; i++) {
            Debt storage d = list[i];
            _transfer(s.token, d.to, d.amount);
            totalTransferred += d.amount;
        }

        emit Settled(splitId, totalTransferred, block.timestamp);
    }

    // ------------------------------------------------------------------
    // View functions
    // ------------------------------------------------------------------

    /// @notice Returns the number of obligations in a group.
    function getDebtCount(uint256 splitId) external view returns (uint256) {
        return debts[splitId].length;
    }

    /// @notice Returns the data of a specific obligation.
    function getDebt(uint256 splitId, uint256 debtIndex)
        external
        view
        returns (address from, address to, uint256 amount, bool paid)
    {
        Debt storage d = debts[splitId][debtIndex];
        return (d.from, d.to, d.amount, d.paid);
    }

    /// @notice Indicates whether all obligations of a group have been paid.
    function isFullyPaid(uint256 splitId) external view returns (bool) {
        Split storage s = splits[splitId];
        return s.exists && s.paidDebts == s.totalDebts;
    }
}
