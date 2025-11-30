/**
 * Transaction logging utility for debugging
 * Logs transaction details and effects
 */

import type { SuiTransactionBlockResponse, SuiTransactionBlockResponseOptions } from '@mysten/sui/client'
import type { SuiSignAndExecuteTransactionOutput } from '@mysten/wallet-standard'

const LOG_PREFIX = '[Sui Transaction]'

/**
 * Log transaction before execution
 */
export function logTransactionStart(
  functionName: string,
  params: Record<string, any>,
  transaction?: any
) {
  if (typeof window === 'undefined') return // Only log in browser

  console.group(`${LOG_PREFIX} Starting: ${functionName}`)
  console.log('Parameters:', params)
  if (transaction) {
    console.log('Transaction:', transaction)
    try {
      const serialized = transaction.serialize({
        onlyTransactionKind: false,
        maxSize: 1024 * 1024, // 1MB
      })
      console.log('Serialized transaction size:', serialized.length, 'bytes')
    } catch (error) {
      console.warn('Could not serialize transaction:', error)
    }
  }
  console.log('Timestamp:', new Date().toISOString())
  console.groupEnd()
}

/**
 * Log transaction success with effects
 */
export function logTransactionSuccess(
  functionName: string,
  result: SuiTransactionBlockResponse | SuiSignAndExecuteTransactionOutput,
  options?: SuiTransactionBlockResponseOptions
) {
  if (typeof window === 'undefined') return // Only log in browser

  console.group(`${LOG_PREFIX} ✅ Success: ${functionName}`)
  console.log('Transaction Digest:', result.digest)
  console.log('Timestamp:', new Date().toISOString())

  // Handle different response types
  const effects = typeof result.effects === 'string'
    ? null
    : result.effects

  console.log('Transaction Status:', effects?.status)

  // Log effects
  if (effects) {
    console.group('Effects:')
    console.log('Status:', effects.status)
    console.log('Gas Used:', effects.gasUsed)
    console.log('Gas Object ID:', effects.gasObject?.reference?.objectId)
    console.log('Gas Owner:', effects.gasObject?.owner)

    // Log created objects
    if (effects.created && effects.created.length > 0) {
      console.group('Created Objects:')
      effects.created.forEach((obj, index) => {
        console.log(`[${index}]`, {
          objectId: obj.reference.objectId,
          owner: obj.owner,
          version: obj.reference.version,
        })
      })
      console.groupEnd()
    }

    // Log mutated objects
    if (effects.mutated && effects.mutated.length > 0) {
      console.group('Mutated Objects:')
      effects.mutated.forEach((obj, index) => {
        console.log(`[${index}]`, {
          objectId: obj.reference.objectId,
          owner: obj.owner,
          version: obj.reference.version,
        })
      })
      console.groupEnd()
    }

    // Log shared objects
    if (effects.sharedObjects && effects.sharedObjects.length > 0) {
      console.group('Shared Objects:')
      effects.sharedObjects.forEach((obj, index) => {
        console.log(`[${index}]`, {
          objectId: obj.objectId,
          version: obj.version,
        })
      })
      console.groupEnd()
    }

    // Log events (only available on SuiTransactionBlockResponse)
    if ('events' in result && result.events && result.events.length > 0) {
      console.group('Events:')
      result.events.forEach((event, index) => {
        console.log(`[${index}]`, {
          type: event.type,
          packageId: event.packageId,
          transactionModule: event.transactionModule,
          sender: event.sender,
          parsedJson: event.parsedJson,
          bcs: event.bcs,
        })
      })
      console.groupEnd()
    }

    // Log errors if any
    if (effects.status?.status === 'failure') {
      console.error('Transaction Failed:', effects.status.error)
    }

    console.groupEnd()
  }

  // Log object changes (only available on SuiTransactionBlockResponse)
  if ('objectChanges' in result && result.objectChanges && result.objectChanges.length > 0) {
    console.group('Object Changes:')
    result.objectChanges.forEach((change, index) => {
      console.log(`[${index}]`, change)
    })
    console.groupEnd()
  }

  // Log balance changes (only available on SuiTransactionBlockResponse)
  if ('balanceChanges' in result && result.balanceChanges && result.balanceChanges.length > 0) {
    console.group('Balance Changes:')
    result.balanceChanges.forEach((change, index) => {
      console.log(`[${index}]`, change)
    })
    console.groupEnd()
  }

  console.log('Full Response:', result)
  console.groupEnd()
}

/**
 * Log transaction error
 */
export function logTransactionError(
  functionName: string,
  error: any,
  params?: Record<string, any>
) {
  if (typeof window === 'undefined') return // Only log in browser

  console.group(`${LOG_PREFIX} ❌ Error: ${functionName}`)
  console.error('Error:', error)
  console.error('Error Message:', error?.message || error?.toString())
  console.error('Error Stack:', error?.stack)
  if (params) {
    console.error('Parameters:', params)
  }
  console.error('Timestamp:', new Date().toISOString())
  console.groupEnd()
}

/**
 * Helper to create a transaction logger wrapper
 */
export function createTransactionLogger(functionName: string) {
  return {
    logStart: (params: Record<string, any>, transaction?: any) =>
      logTransactionStart(functionName, params, transaction),
    logSuccess: (result: SuiTransactionBlockResponse | SuiSignAndExecuteTransactionOutput) =>
      logTransactionSuccess(functionName, result),
    logError: (error: any, params?: Record<string, any>) =>
      logTransactionError(functionName, error, params),
  }
}

