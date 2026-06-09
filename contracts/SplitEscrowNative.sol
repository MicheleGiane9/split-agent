// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SplitEscrowNative
 * @notice Version of SplitEscrow that works with the Pharos NATIVE coin (PHRS),
 *         instead of an ERC-20 token. Useful for simple testnet demos, where it is
 *         easy to get PHRS from a faucet but hard to obtain test USDC.
 *
 *         Flow:
 *         1. The agent creates a group with debtors, creditors and amounts (createSplit).
 *         2. Each debtor calls deposit() sending PHRS along (msg.value == amount owed).
 *         3. Once everyone has paid, anyone calls settle() to liquidate and pay each
 *            creditor in native PHRS.
 *         4. Immutable events are emitted at each step.
 */
contract SplitEscrowNative {
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    struct Debt {
        address from;   // debtor
        address to;     // creditor
        uint256 amount; // amount owed in wei (PHRS)
        bool paid;      // whether the debtor has deposited
    }

    struct Split {
        address creator;     // who created the group (the agent)
        uint256 deadline;    // payment deadline
        uint256 totalDebts;  // total obligations
        uint256 paidDebts;   // obligations already paid
        bool settled;        // whether already settled
        bool exists;         // existence marker
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    uint256 public nextSplitId;
    mapping(uint256 => Split) public splits;
    mapping(uint256 => Debt[]) public debts;

    // ------------------------------------------------------------------
    // Events (immutable on-chain record)
    // ------------------------------------------------------------------

    event SplitCreated(
        uint256 indexed splitId,
        address indexed creator,
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
    // Custom errors
    // ------------------------------------------------------------------

    error SplitDoesNotExist();
    error AlreadySettled();
    error DeadlinePassed();
    error InvalidDebtIndex();
    error DebtAlreadyPaid();
    error NotTheDebtor();
    error NotAllPaid();
    error WrongAmount();
    error EmptyDebts();
    error ZeroAmount();
    error NativeTransferFailed();

    // ------------------------------------------------------------------
    // Main functions
    // ------------------------------------------------------------------

    /**
     * @notice Create a new split group (in native PHRS).
     * @param froms    List of debtors.
     * @param tos      List of creditors (same index).
     * @param amounts  Amounts owed in wei (same index).
     * @param duration Duration in seconds until the deadline.
     * @return splitId Group identifier.
     */
    function createSplit(
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

        emit SplitCreated(splitId, msg.sender, n, s.deadline);
    }

    /**
     * @notice The debtor deposits their share in PHRS (send msg.value equal to the amount owed).
     * @param splitId   Group ID.
     * @param debtIndex Obligation index.
     */
    function deposit(uint256 splitId, uint256 debtIndex) external payable {
        Split storage s = splits[splitId];
        if (!s.exists) revert SplitDoesNotExist();
        if (s.settled) revert AlreadySettled();
        if (block.timestamp > s.deadline) revert DeadlinePassed();
        if (debtIndex >= debts[splitId].length) revert InvalidDebtIndex();

        Debt storage d = debts[splitId][debtIndex];
        if (d.paid) revert DebtAlreadyPaid();
        if (msg.sender != d.from) revert NotTheDebtor();
        if (msg.value != d.amount) revert WrongAmount();

        d.paid = true;
        s.paidDebts += 1;

        emit Deposited(splitId, debtIndex, d.from, d.to, d.amount);
    }

    /**
     * @notice Settle the group once all obligations have been paid, paying each
     *         creditor in native PHRS.
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
            (bool ok, ) = payable(d.to).call{value: d.amount}("");
            if (!ok) revert NativeTransferFailed();
            totalTransferred += d.amount;
        }

        emit Settled(splitId, totalTransferred, block.timestamp);
    }

    // ------------------------------------------------------------------
    // View functions
    // ------------------------------------------------------------------

    function getDebtCount(uint256 splitId) external view returns (uint256) {
        return debts[splitId].length;
    }

    function getDebt(uint256 splitId, uint256 debtIndex)
        external
        view
        returns (address from, address to, uint256 amount, bool paid)
    {
        Debt storage d = debts[splitId][debtIndex];
        return (d.from, d.to, d.amount, d.paid);
    }

    function isFullyPaid(uint256 splitId) external view returns (bool) {
        Split storage s = splits[splitId];
        return s.exists && s.paidDebts == s.totalDebts;
    }
}
