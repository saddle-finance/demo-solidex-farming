import 'dotenv/config'

import {BigNumber, Contract, Wallet, constants, providers, utils} from "ethers"

import ERC20 from "./abi/erc20.json"
import LPDEPOSITOR_ABI from "./abi/lpDepositor.json"
import ROUTER_ABI from "./abi/router.json"

const {Zero} = constants
const {formatUnits} = utils

const POLLING_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const USD_THRESHOLD = 500
const GAS_PRICE = utils.parseUnits("4000", "gwei") // gas is cheap on ftm so use a high value

const POOLS = {
    SOLID_SOLIDSEX: "0x62E2819Dd417F3b430B6fa5Fd34a49A377A02ac8",
    USDC_SYN: "0xB1b3B96cf35435b2518093acD50E02fe03A0131f"
}
const TOKENS = {
    USDC: {
        decimals: 6,
        address: "0x04068da6c83afcfa0e13ba15a6696662335d5b75"
    },
    SOLID: {
        decimals: 18,
        address: "0x888ef71766ca594ded1f0fa3ae64ed2941740a20"
    },
    SEX: {
        decimals: 18,
        address: "0xd31fcd1f7ba190dbc75354046f6024a9b86014d7"
    },
    SOLIDSEX: {
        decimals: 18,
        address: "0x41adac6c1ff52c5e27568f27998d747f7b69795b"
    },
    WFTM: {
        decimals: 18,
        address: "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83"
    },
    SOLID_SOLIDSEX_PAIR : {
        decimals: 18,
        address: "0x62e2819dd417f3b430b6fa5fd34a49a377a02ac8"
    }
}
// or "https://rpc.ftm.tools/"
const provider = new providers.JsonRpcProvider("https://rpc.ankr.com/fantom", 250)
const signer = new Wallet("0x" + process.env.PRIVATE_KEY, provider)
const routerContract = new Contract(
    "0xa38cd27185a464914d3046f0ab9d43356b34829d",
    ROUTER_ABI,
    signer
)
const lpDepositorContract = new Contract(
    "0x26e1a0d851cf28e697870e1b7f053b605c8b060f",
    LPDEPOSITOR_ABI,
    signer
)
const sexContract = new Contract(
    TOKENS.SEX.address,
    ERC20,
    provider
)
const solidContract = new Contract(
    TOKENS.SOLID.address,
    ERC20,
    provider
)
const solidsexContract = new Contract(
    TOKENS.SOLIDSEX.address,
    ERC20,
    provider
)
const solidSolidsexPairContract = new Contract(
    TOKENS.SOLID_SOLIDSEX_PAIR.address,
    ERC20,
    provider
)

function bnToFloat(bn, decimals) {
    return parseFloat(
        formatUnits(bn, decimals)
    )
}

function nowPlusMins(mins) {
    return Math.floor(Date.now() / 1000) + mins * 60
}


async function getPendingAmounts() {
    // returns [solid, sex] amount for each pool
    const results = await lpDepositorContract.pendingRewards(
        signer.address,
        [
            POOLS.SOLID_SOLIDSEX,
            POOLS.USDC_SYN
        ]
    )
    return results.reduce((output, x) => {
        return [output[0].add(x[0]), output[1].add(x[1])]
    }, [Zero, Zero])
}

async function getUSDCRate(token, amount) {
    // assumes there is not a direct token/USDC pair
    const result = await routerContract.getAmountsOut(
        amount,
        [
            [token,TOKENS.WFTM.address,false],
            [TOKENS.WFTM.address,TOKENS.USDC.address,false]
        ]
    )
    return result[2]
}

async function getSOLIDtoSOLIDSEXRate(amount) {
    const result = await routerContract.getAmountsOut(
        amount,
        [
            [TOKENS.SOLID.address, TOKENS.SOLIDSEX.address,false],
        ]
    )
    return result[1]
}

async function claimRewards(opts = {}) {
    const txn = await lpDepositorContract.getReward([
        POOLS.SOLID_SOLIDSEX,
        POOLS.USDC_SYN
    ],
    opts
    )
    return await txn.wait()
}

async function main() {
    try {
        console.log(`\nTime: ${new Date()}`)
        // Step 1: Get pending amounts
        const pendingAmounts = await getPendingAmounts()
        const solidAmtFloat = bnToFloat(pendingAmounts[0], TOKENS.SOLID.decimals)
        const sexAmtFloat = bnToFloat(pendingAmounts[1], TOKENS.SEX.decimals)
        console.log(`Pending amounts: ${(solidAmtFloat).toFixed(0)} SOLID, ${(sexAmtFloat).toFixed(0)} SEX`)

        // Step 2: Get USDC rates
        const usdcRates = await Promise.all([
            getUSDCRate(TOKENS.SOLID.address, pendingAmounts[0]),
            getUSDCRate(TOKENS.SEX.address, pendingAmounts[1])
        ])
        const solidUSDAmt = bnToFloat(
            usdcRates[0],
            TOKENS.USDC.decimals
        )
        const sexUSDAmt = bnToFloat(
            usdcRates[1],
            TOKENS.USDC.decimals
        )
        const rewardsSumUSD = solidUSDAmt + sexUSDAmt

        console.log(`Prices: SOLID = $${(solidUSDAmt/solidAmtFloat).toFixed(2)} USD, SEX = $${(sexUSDAmt/sexAmtFloat).toFixed(2)} USD`)
        console.log(`USDC amounts: $${solidUSDAmt.toFixed(2)} SOLID, $${sexUSDAmt.toFixed(2)} SEX`)
        console.log(`Total rewards: $${rewardsSumUSD.toFixed(2)} USD`)

        console.log(`using ${GAS_PRICE.toString()} gasPrice`)

        if (rewardsSumUSD < USD_THRESHOLD) {
            console.log("Skipping...")
            return
        }

        // Step 3: claim reward
        {
            await claimRewards({gasPrice: GAS_PRICE})
            console.log("claimedRewards")
        }

        // Step 4: Swap 1/2 solid to solidsex
        {
            const solidBalance = await solidContract.balanceOf(signer.address)
            const minAmountOut = await getSOLIDtoSOLIDSEXRate(solidBalance)
            const txn = await routerContract.swapExactTokensForTokens(
                solidBalance.div(2),
                minAmountOut.mul(99).div(200), // min Amt out
                [
                    [TOKENS.SOLID.address,TOKENS.SOLIDSEX.address,true],
                ], // route
                signer.address, // recipient
                nowPlusMins(10), // deadline
                {gasPrice: GAS_PRICE, gasLimit: 2_000_000}
            )
            await txn.wait()
            console.log("Swapped SOLID for SOLIDSEX")
        }

        // Step 5: add liquidity to solidly
        {
            const solidexBalance = await solidsexContract.balanceOf(signer.address)
            const solidBalance = await solidContract.balanceOf(signer.address)
            const quoted = await routerContract.quoteAddLiquidity(
                TOKENS.SOLID.address,
                TOKENS.SOLIDSEX.address,
                true,
                solidBalance,
                solidexBalance,
            )
            const txn = await routerContract.addLiquidity(
                TOKENS.SOLID.address,
                TOKENS.SOLIDSEX.address,
                true,
                solidBalance,
                solidexBalance,
                quoted[0],
                quoted[1],
                signer.address,
                nowPlusMins(10),
                {gasPrice: GAS_PRICE, gasLimit: 2_000_000}
            )
            await txn.wait()
            console.log("Deposited liquidity into SOLID-SOLIDSEX pair")
        }

        // Step 6: deposit to solidex
        {
            const pairBalance = await solidSolidsexPairContract.balanceOf(signer.address)
            if (pairBalance.gt(0)) {
                console.log(`${pairBalance.toString()} SOLID-SOLIDSEX lp amount available`)
                const txn = await lpDepositorContract.deposit(
                    TOKENS.SOLID_SOLIDSEX_PAIR.address,
                    pairBalance,
                    {gasPrice: GAS_PRICE, gasLimit: 2_000_000}
                )
                await txn.wait()
                console.log("Deposited lp token to solidex")
            } else {
                console.log("No lp amount available.. skipping")
            }
        }

        console.log("Job done!")

    } catch (e) {
        console.log(e)
    }
}

main() // run once out of the gate
setInterval(main, POLLING_INTERVAL_MS)