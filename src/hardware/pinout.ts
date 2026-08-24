import { RPiPin } from '../types/index.js';

// Standard 40-pin header mapping for Raspberry Pi (Pi 3 / 4 / 5 / Zero 2W)
export const RPI_40_PIN_HEADER: RPiPin[] = [
  { pinNumber: 1, bcmGpio: null, name: '3.3V Power', capabilities: ['POWER_3V3'] },
  { pinNumber: 2, bcmGpio: null, name: '5V Power', capabilities: ['POWER_5V'] },
  { pinNumber: 3, bcmGpio: 2, name: 'GPIO 2 (SDA)', capabilities: ['GPIO', 'I2C_SDA'] },
  { pinNumber: 4, bcmGpio: null, name: '5V Power', capabilities: ['POWER_5V'] },
  { pinNumber: 5, bcmGpio: 3, name: 'GPIO 3 (SCL)', capabilities: ['GPIO', 'I2C_SCL'] },
  { pinNumber: 6, bcmGpio: null, name: 'Ground', capabilities: ['GROUND'] },
  { pinNumber: 7, bcmGpio: 4, name: 'GPIO 4 (GPCLK0)', capabilities: ['GPIO'] },
  { pinNumber: 8, bcmGpio: 14, name: 'GPIO 14 (TXD)', capabilities: ['GPIO', 'UART_TX'] },
  { pinNumber: 9, bcmGpio: null, name: 'Ground', capabilities: ['GROUND'] },
  { pinNumber: 10, bcmGpio: 15, name: 'GPIO 15 (RXD)', capabilities: ['GPIO', 'UART_RX'] },
  { pinNumber: 11, bcmGpio: 17, name: 'GPIO 17', capabilities: ['GPIO'] },
  { pinNumber: 12, bcmGpio: 18, name: 'GPIO 18 (PWM0)', capabilities: ['GPIO', 'PWM'] },
  { pinNumber: 13, bcmGpio: 27, name: 'GPIO 27', capabilities: ['GPIO'] },
  { pinNumber: 14, bcmGpio: null, name: 'Ground', capabilities: ['GROUND'] },
  { pinNumber: 15, bcmGpio: 22, name: 'GPIO 22', capabilities: ['GPIO'] },
  { pinNumber: 16, bcmGpio: 23, name: 'GPIO 23', capabilities: ['GPIO'] },
  { pinNumber: 17, bcmGpio: null, name: '3.3V Power', capabilities: ['POWER_3V3'] },
  { pinNumber: 18, bcmGpio: 24, name: 'GPIO 24', capabilities: ['GPIO'] },
  { pinNumber: 19, bcmGpio: 10, name: 'GPIO 10 (MOSI)', capabilities: ['GPIO', 'SPI_MOSI'] },
  { pinNumber: 20, bcmGpio: null, name: 'Ground', capabilities: ['GROUND'] },
  { pinNumber: 21, bcmGpio: 9, name: 'GPIO 9 (MISO)', capabilities: ['GPIO', 'SPI_MISO'] },
  { pinNumber: 22, bcmGpio: 25, name: 'GPIO 25', capabilities: ['GPIO'] },
  { pinNumber: 23, bcmGpio: 11, name: 'GPIO 11 (SCLK)', capabilities: ['GPIO', 'SPI_SCLK'] },
  { pinNumber: 24, bcmGpio: 8, name: 'GPIO 8 (CE0)', capabilities: ['GPIO', 'SPI_CE0'] },
  { pinNumber: 25, bcmGpio: null, name: 'Ground', capabilities: ['GROUND'] },
  { pinNumber: 26, bcmGpio: 7, name: 'GPIO 7 (CE1)', capabilities: ['GPIO', 'SPI_CE1'] },
  { pinNumber: 27, bcmGpio: 0, name: 'GPIO 0 (ID_SD)', capabilities: ['I2C_SDA'] },
  { pinNumber: 28, bcmGpio: 1, name: 'GPIO 1 (ID_SC)', capabilities: ['I2C_SCL'] },
  { pinNumber: 29, bcmGpio: 5, name: 'GPIO 5', capabilities: ['GPIO'] },
  { pinNumber: 30, bcmGpio: null, name: 'Ground', capabilities: ['GROUND'] },
  { pinNumber: 31, bcmGpio: 6, name: 'GPIO 6', capabilities: ['GPIO'] },
  { pinNumber: 32, bcmGpio: 12, name: 'GPIO 12 (PWM0)', capabilities: ['GPIO', 'PWM'] },
  { pinNumber: 33, bcmGpio: 13, name: 'GPIO 13 (PWM1)', capabilities: ['GPIO', 'PWM'] },
  { pinNumber: 34, bcmGpio: null, name: 'Ground', capabilities: ['GROUND'] },
  { pinNumber: 35, bcmGpio: 19, name: 'GPIO 19 (MISO)', capabilities: ['GPIO', 'SPI_MISO'] },
  { pinNumber: 36, bcmGpio: 16, name: 'GPIO 16', capabilities: ['GPIO'] },
  { pinNumber: 37, bcmGpio: 26, name: 'GPIO 26', capabilities: ['GPIO'] },
  { pinNumber: 38, bcmGpio: 20, name: 'GPIO 20 (MOSI)', capabilities: ['GPIO', 'SPI_MOSI'] },
  { pinNumber: 39, bcmGpio: null, name: 'Ground', capabilities: ['GROUND'] },
  { pinNumber: 40, bcmGpio: 21, name: 'GPIO 21 (SCLK)', capabilities: ['GPIO', 'SPI_SCLK'] },
];

export function getPinByNumber(pinNumber: number): RPiPin | undefined {
  return RPI_40_PIN_HEADER.find(p => p.pinNumber === pinNumber);
}

export function getPinByBcmGpio(bcmGpio: number): RPiPin | undefined {
  return RPI_40_PIN_HEADER.find(p => p.bcmGpio === bcmGpio);
}

export function getAvailableGpioPins(): RPiPin[] {
  return RPI_40_PIN_HEADER.filter(p => p.capabilities.includes('GPIO'));
}
