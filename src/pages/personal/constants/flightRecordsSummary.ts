import {
    FLIGHT_RECORDS,
} from "../../../constants/external-links";
import type { FlightRecord } from "../../../constants/type";

/** 按年份聚合后的乘机记录分组，供台账列表渲染。 */
export interface FlightYearGroup {
    /** 分组年份，取自 `departureDate` 首段。 */
    year: number;
    /** 该年份内的乘机记录，按出发日期从新到旧排序。 */
    records: FlightRecord[];
}

/**
 * 从 `YYYY-M-D` 格式出发日期解析年份，供分组与排序使用。
 */
const parseFlightRecordYear = (departureDate: string): number => {
    const [yearPart] = departureDate.split("-");

    return Number(yearPart);
};

/**
 * 将乘机记录按年份倒序聚合，同年内按出发日期从新到旧排序。
 */
const groupFlightRecordsByYear = (
    flightRecords: FlightRecord[],
): FlightYearGroup[] => {
    const recordsByYear = new Map<number, FlightRecord[]>();

    flightRecords.forEach((flightRecord: FlightRecord): void => {
        const recordYear = parseFlightRecordYear(flightRecord.departureDate);
        const yearRecords = recordsByYear.get(recordYear) ?? [];

        recordsByYear.set(recordYear, [...yearRecords, flightRecord]);
    });

    return Array.from(recordsByYear.entries())
        .map(
            ([year, records]: [number, FlightRecord[]]): FlightYearGroup => ({
                year,
                // 按数字段比较未补零的日期，避免字符串排序将 9 月排在 10 月前。
                records: [...records].sort(
                    (firstRecord: FlightRecord, secondRecord: FlightRecord): number =>
                        secondRecord.departureDate.localeCompare(
                            firstRecord.departureDate,
                            "en",
                            { numeric: true },
                        ),
                ),
            }),
        )
        .sort(
            (
                firstGroup: FlightYearGroup,
                secondGroup: FlightYearGroup,
            ): number => secondGroup.year - firstGroup.year,
        );
};

/** 乘机记录总数。 */
export const FLIGHT_RECORD_COUNT: number = FLIGHT_RECORDS.length;

/** 乘机记录涉及的不重复航司数量。 */
export const FLIGHT_AIRLINE_COUNT: number = new Set(
    FLIGHT_RECORDS.map(
        (flightRecord: FlightRecord): string => flightRecord.airline,
    ),
).size;

/** 乘机记录涉及的不重复机型数量。 */
export const FLIGHT_AIRCRAFT_TYPE_COUNT: number = new Set(
    FLIGHT_RECORDS.map(
        (flightRecord: FlightRecord): string => flightRecord.aircraft,
    ),
).size;

/** 个人页乘机台账按年份分组后的列表数据。 */
export const flightRecordsByYear: FlightYearGroup[] =
    groupFlightRecordsByYear(FLIGHT_RECORDS);
