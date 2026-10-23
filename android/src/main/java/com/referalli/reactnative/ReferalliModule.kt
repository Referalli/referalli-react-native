package com.referalli.reactnative

import android.content.Context
import android.os.Build
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.atomic.AtomicBoolean

/** `NativeModules.ReferalliModule`: install info (Play Install Referrer) and persistent storage. */
class ReferalliModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = NAME

    private val prefs by lazy { context.getSharedPreferences("referalli", Context.MODE_PRIVATE) }

    /** Resolves `{ referrer: string | null, firstInstallTime: number | null }`; never rejects. */
    @ReactMethod
    fun getInstallInfo(promise: Promise) {
        val firstInstall = firstInstallTime()
        val settled = AtomicBoolean(false)
        fun settle(referrer: String?) {
            if (!settled.compareAndSet(false, true)) return
            val map = Arguments.createMap()
            if (referrer != null) map.putString("referrer", referrer) else map.putNull("referrer")
            if (firstInstall != null) map.putDouble("firstInstallTime", firstInstall.toDouble()) else map.putNull("firstInstallTime")
            promise.resolve(map)
        }
        val client = try {
            InstallReferrerClient.newBuilder(context).build()
        } catch (_: Exception) {
            settle(null)
            return
        }
        try {
            client.startConnection(object : InstallReferrerStateListener {
                override fun onInstallReferrerSetupFinished(responseCode: Int) {
                    var referrer: String? = null
                    try {
                        if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                            referrer = client.installReferrer.installReferrer
                        }
                    } catch (_: Exception) {
                        // unavailable
                    } finally {
                        runCatching { client.endConnection() }
                        settle(referrer)
                    }
                }

                override fun onInstallReferrerServiceDisconnected() {
                    settle(null)
                }
            })
        } catch (_: Exception) {
            settle(null)
        }
    }

    @ReactMethod
    fun getItem(key: String, promise: Promise) {
        promise.resolve(prefs.getString(key, null))
    }

    @ReactMethod
    fun setItem(key: String, value: String, promise: Promise) {
        prefs.edit().putString(key, value).apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun removeItem(key: String, promise: Promise) {
        prefs.edit().remove(key).apply()
        promise.resolve(null)
    }

    private fun firstInstallTime(): Long? = try {
        val pm = context.packageManager
        @Suppress("DEPRECATION")
        val info = if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageInfo(context.packageName, android.content.pm.PackageManager.PackageInfoFlags.of(0))
        } else {
            pm.getPackageInfo(context.packageName, 0)
        }
        info.firstInstallTime
    } catch (_: Exception) {
        null
    }

    companion object {
        const val NAME = "ReferalliModule"
    }
}
