/* eslint-disable no-bitwise */
import { useMemo, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import {
  BleError,
  BleManager,
  Characteristic,
  Device,
} from "react-native-ble-plx";

import * as ExpoDevice from "expo-device";
import base64 from "react-native-base64";


// Standard UUIDs for heart rate service and feature
const HEART_RATE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";
const HEART_RATE_CHARACTERISTIC = "00002a37-0000-1000-8000-00805f9b34fb";


interface BluetoothLowEnergyApi {
  requestPermissions(): Promise<boolean>;
  scanForPeripherals(): void;
  connectToDevice: (deviceId: Device) => Promise<void>;
  allDevices: Device[];
  connectedDevice: Device | null;
  heartRate: number;

}

function useBLE(): BluetoothLowEnergyApi {
  const bleManager = useMemo(() => new BleManager(), []);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [heartRate, setHeartRate] = useState<number>(-1)
  

  const requestAndroid31Permissions = async () => {
    const bluetoothScanPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      {
        title:"Location permission" ,
        message: "Bluetooth Low Energy requires location permissions",
        buttonPositive: "OK",
      }
    );
    const bluetoothConnectPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      {
        title:"Connection permission",
        message: "Bluetooth Low Energy requires connection permissions",
        buttonPositive: "OK",
      }
    );
    const fineLocationPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: "Location permission",
        message: "Bluetooth Low Energy requiere precise location",
        buttonPositive: "OK",
      }
    );

    return (
      bluetoothScanPermission === "granted" &&
      bluetoothConnectPermission === "granted" &&
      fineLocationPermission === "granted"
    );
  };

  const requestPermissions = async () => {
    if (Platform.OS === "android") {
      if ((ExpoDevice.platformApiLevel ?? -1) < 31) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location permission",
            message: "Bluetooth Low Energy requiere ubicación precisa",
            buttonPositive: "OK",
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const isGranted = await requestAndroid31Permissions();
        return isGranted;
      }
    } else {
      return true;
    }
  };

  const isDuplicateDevice = (devices: Device[], nextDevice: Device) =>
    devices.findIndex((device) => nextDevice.id === device.id) > -1;

  const scanForPeripherals = () => {
    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log("Error while scanning:", error);
        return;
      }
      //This line allows me to only search for the device with the specific name so as not to overload the search
      if (device && device.name?.includes("808S")) {
        setAllDevices((prevState: Device[]) => {
          if (!isDuplicateDevice(prevState, device)) {
            return [...prevState, device];
          }
          return prevState;
        });
      }
    });
  };

  const connectToDevice = async (device: Device) => {
    try {
      const deviceConnection = await bleManager.connectToDevice(device.id);
      console.log("✅ Connected device:", deviceConnection.name);
      setConnectedDevice(deviceConnection);
      await deviceConnection.discoverAllServicesAndCharacteristics();
      await logAvailableServicesAndCharacteristics(deviceConnection);
      
      bleManager.stopDeviceScan();
      startStreamingData(deviceConnection);
    } catch (e) {
      console.log("❌ Error connecting", e);
    }
  };

  const logAvailableServicesAndCharacteristics = async (device: Device) => {
    try {
      const services = await device.services();
      console.log("📡Available services :");
      for (const service of services) {
        console.log(`🔹 Services UUID: ${service.uuid}`);
        const characteristics = await device.characteristicsForService(service.uuid);
        for (const characteristic of characteristics) {
          console.log(`   └── Feature UUID: ${characteristic.uuid}`);
        }
      }
    } catch (error) {
      console.log("❌ Error getting services/features: ", error);
    }
  };
  

  const onHeartRateUpdate = (
    error: BleError | null,
    characteristic: Characteristic | null
  ) => {
    if (error) {
      console.log(error);
      return -1;
    } else if (!characteristic?.value) {
      console.log("No Data was recieved");
      return -1;
    }

    const rawData = base64.decode(characteristic.value);
    const data = [...rawData].map((c) => c.charCodeAt(0));
    let innerHeartRate: number = -1;

    const firstBitValue: number = Number(rawData) & 0x01;

    if (firstBitValue === 0) {
      innerHeartRate = rawData[1].charCodeAt(0);
    } else {
      innerHeartRate =
        Number(rawData[1].charCodeAt(0) << 8) +
        Number(rawData[2].charCodeAt(2));
    }
    
    //console.log("📦 Datos decodificados (bytes):", data);
    setHeartRate(innerHeartRate);
  };
  

  const startStreamingData = async (device: Device) => {
    if (!device) {
      console.log("❌ No device connected");
      return;
    }

    device.monitorCharacteristicForService(
      HEART_RATE_UUID,
      HEART_RATE_CHARACTERISTIC,
      onHeartRateUpdate
    );
  };
  
  

  return {
    scanForPeripherals,
    requestPermissions,
    connectToDevice,
    allDevices,
    connectedDevice,
    heartRate
  };
}


export default useBLE;
