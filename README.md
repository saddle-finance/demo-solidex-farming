# Example FTM Solidex Farming Script

> A complete script to automatically yield farm and compound through Solidex using ethersjs

[Saddle](https://saddle.exchange/) is [partners](https://twitter.com/SolidexFantom/status/1496145389736574985) with [Solidex](https://solidexfinance.com/#/home) and [Solidly](https://solidly.exchange/) on Fantom network. Being active defi participants ourselves, some Saddle staff members are LPing, staking, and/or farming through Solidex. We thought it might be fun to share with the community an example of what one of our personal farming scripts looks like. The script assumes that you are LPing in the `USDC/SYN` pool. It will harvest your rewards once you have accumulated $500 claimable and will sell to LP in the `SOLID/SOLIDsex` pool for additional yield while holding `$SEX`

## How it works

This script has 6 Steps that run on a regular internal:

1. Fetch the pending rewards for your account
2. Get the USDC price of the reward tokens (`SOLID` and `SEX`)

Continue only if you rewards are worth >$500

3. Claim all of your rewards
4. Swap 1/2 of your awarded `SOLID` to `SOLIDsex`
5. Add liquidity to the Solidly `SOLID/SOLIDsex` pool
6. Deposit Solidly lpToken into Solidex pool

## Running the script
1. Install dependencies `npm ci`
2. Create `.env` file and add your wallet's key `PRIVATE_KEY=xxx`
3. Run the script `npm run start`

## Configuring
Set `POLLING_INTERVAL_MS`, `USD_THRESHOLD`, and `GAS_PRICE` to fit your needs

Note that the Solidex contracts use `true/false` in their routes to denote `stable/volatile` pools. 
For example, the following code will give you the exchange rate through the stable pool (sAMM) rather than volatile pool (vAMM)
```
await routerContract.getAmountsOut(
    amount,
    [
        [TOKENS.SOLID.address, TOKENS.SOLIDSEX.address, true],
    ]
)
```

## Disclaimer
This is not financial advice. This script exists for demonstration purposes only and should not be used with real funds. Don't share your wallet's private key with anyone and don't check it into a git repo. We accept no liability for how anyone chooses to use this script. 
