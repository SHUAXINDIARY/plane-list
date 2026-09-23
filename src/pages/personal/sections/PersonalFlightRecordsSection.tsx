import { useState, type ReactElement } from "react";
import {
    FLIGHT_AIRCRAFT_TYPE_COUNT,
    FLIGHT_AIRLINE_COUNT,
    FLIGHT_RECORD_COUNT,
    flightRecordsByYear,
    type FlightYearGroup,
} from "../constants/flightRecordsSummary";
import type {
    FlightRecord,
    FlightRouteSeparator,
} from "../../../constants/type";

/** 单程路线连接符映射，供台账行内展示。 */
const FLIGHT_ROUTE_SEPARATOR_LABEL: Record<FlightRouteSeparator, string> = {
    dash: "-",
    arrow: "->",
};

/** 乘机记录出发日期的固定数据格式。 */
const FLIGHT_DEPARTURE_DATE_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/**
 * 判断出发日是否严格晚于用户本地当天；格式不合法的历史数据不展示状态标签。
 */
const isPendingFlight = (departureDate: string): boolean => {
    const dateParts = departureDate.match(FLIGHT_DEPARTURE_DATE_PATTERN);

    if (dateParts === null) {
        return false;
    }

    const year = Number(dateParts[1]);
    const month = Number(dateParts[2]);
    const day = Number(dateParts[3]);
    const departureDayTimestamp = Date.UTC(year, month - 1, day);
    const parsedDepartureDate = new Date(departureDayTimestamp);

    if (
        parsedDepartureDate.getUTCFullYear() !== year ||
        parsedDepartureDate.getUTCMonth() !== month - 1 ||
        parsedDepartureDate.getUTCDate() !== day
    ) {
        return false;
    }

    const currentDate = new Date();
    const currentDayTimestamp = Date.UTC(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate(),
    );

    return departureDayTimestamp > currentDayTimestamp;
};

/**
 * 获取单条乘机记录的航线连接符，供起降地点之间的视觉连接使用。
 */
const getFlightRouteSeparator = (flightRecord: FlightRecord): string => {
    if (flightRecord.routeKind === "round-trip") {
        return "<->";
    }

    return FLIGHT_ROUTE_SEPARATOR_LABEL[flightRecord.routeSeparator ?? "dash"];
};

/**
 * 将乘机记录的日期格式化为列表展示文案，往返时合并返程短日期。
 */
const formatFlightDate = (flightRecord: FlightRecord): string => {
    if (
        flightRecord.routeKind === "round-trip" &&
        flightRecord.returnDate !== undefined
    ) {
        return `${flightRecord.departureDate}/${flightRecord.returnDate}`;
    }

    return flightRecord.departureDate;
};

/** 年度图表的最大值，用于将各年份记录映射到相同比例。 */
const FLIGHT_RECORD_CHART_MAX = Math.max(
    ...flightRecordsByYear.map(
        (flightYearGroup: FlightYearGroup): number =>
            flightYearGroup.records.length,
    ),
    1,
);

type FlightChartMetric = "aircraft" | "airline" | "country";

/** 从航点的“国家/地区-地点”格式中提取国家或地区名称。 */
const getCountryForRoutePoint = (routePoint: string): string => {
    const separatorIndex = routePoint.indexOf("-");

    if (separatorIndex <= 0) {
        return "其他地区";
    }

    const countryName = routePoint.slice(0, separatorIndex).trim();
    return countryName || "其他地区";
};

const getMetricValues = (
    record: FlightRecord,
    metric: FlightChartMetric,
): string[] => {
    if (metric === "aircraft") return [record.aircraft];
    if (metric === "airline") return [record.airline];
    return [
        getCountryForRoutePoint(record.origin),
        getCountryForRoutePoint(record.destination),
    ];
};

/** 乘机记录年度分布图，图形与文本数据保持同步。 */
const FlightRecordsYearChart = (): ReactElement => (
    <section
        className="flight-records-chart"
        aria-labelledby="flight-records-chart-title"
    >
        <div className="flight-records-chart__header">
            <div>
                <p className="personal-section__eyebrow">Annual view</p>
                <h3 id="flight-records-chart-title">每年乘机次数</h3>
            </div>
            <span className="flight-records-chart__unit">单位：次</span>
        </div>
        <div
            className="flight-records-chart__plot"
            role="img"
            aria-label="按年份统计的乘机次数柱状图"
        >
            {flightRecordsByYear.map(
                (flightYearGroup: FlightYearGroup): ReactElement => {
                    const recordCount = flightYearGroup.records.length;
                    const barScale = recordCount / FLIGHT_RECORD_CHART_MAX;

                    return (
                        <div
                            className="flight-records-chart__row"
                            key={flightYearGroup.year}
                        >
                            <span className="flight-records-chart__year">
                                {flightYearGroup.year}
                            </span>
                            <span className="flight-records-chart__track">
                                <span
                                    className="flight-records-chart__bar"
                                    style={{ width: `${barScale * 100}%` }}
                                />
                            </span>
                            <strong className="flight-records-chart__value">
                                {recordCount}
                            </strong>
                        </div>
                    );
                },
            )}
        </div>
        <table className="sr-only">
            <caption>各年份乘机记录数量</caption>
            <thead>
                <tr>
                    <th scope="col">年份</th>
                    <th scope="col">次数</th>
                </tr>
            </thead>
            <tbody>
                {flightRecordsByYear.map(
                    (flightYearGroup: FlightYearGroup): ReactElement => (
                        <tr key={`chart-table-${flightYearGroup.year}`}>
                            <th scope="row">{flightYearGroup.year}</th>
                            <td>{flightYearGroup.records.length}</td>
                        </tr>
                    ),
                )}
            </tbody>
        </table>
    </section>
);

/** 按年份展示乘机机型构成，图形与屏幕阅读器表格保持同步。 */
const FlightRecordsAircraftChart = (): ReactElement => {
    const [metric, setMetric] = useState<FlightChartMetric>("aircraft");
    const metricNames: Record<FlightChartMetric, string> = {
        aircraft: "机型",
        airline: "航司",
        country: "国家或地区",
    };
    let metricValues = Array.from(
        new Set(
            flightRecordsByYear.flatMap((group) =>
                group.records.flatMap((record) => getMetricValues(record, metric)),
            ),
        ),
    )
    if (metric === "aircraft") {
        metricValues = metricValues.sort((a, b) => {
            const _A = a[0];
            const _B = b[0];
            if (_A === _B) {
                return Number(a[1]) - Number(b[1]);
            }
            return Number(_A) - Number(_B);
        });
    }

    const countMetric = (group: FlightYearGroup, value: string): number =>
        group.records.reduce(
            (total, record) =>
                total +
                getMetricValues(record, metric).filter((item) => item === value).length,
            0,
        );
    const maxMetricCount = Math.max(
        ...flightRecordsByYear.flatMap((group) =>
            metricValues.map((value) => countMetric(group, value)),
        ),
        1,
    );

    return (
        <section
            className="flight-aircraft-chart"
            aria-labelledby="flight-aircraft-chart-title"
        >
            <div className="flight-records-chart__header">
                <div>
                    <p className="personal-section__eyebrow">Annual mix</p>
                    <h3 id="flight-aircraft-chart-title">
                        每年{metricNames[metric]}概览
                    </h3>
                </div>
                <div
                    className="flight-aircraft-chart__switcher"
                    role="group"
                    aria-label="切换统计维度"
                >
                    {(Object.keys(metricNames) as FlightChartMetric[]).map((option) => (
                        <button
                            type="button"
                            key={option}
                            aria-pressed={metric === option}
                            onClick={() => setMetric(option)}
                        >
                            {metricNames[option]}
                        </button>
                    ))}
                </div>
            </div>
            <div
                className="flight-aircraft-chart__scroll"
                role="img"
                aria-label="按年份统计的乘机机型热力图"
            >
                <div
                    className="flight-aircraft-chart__grid"
                    style={{
                        gridTemplateColumns: `minmax(6.5rem, 8.5rem) repeat(${flightRecordsByYear.length}, minmax(3.6rem, 1fr))`,
                    }}
                >
                    <span className="flight-aircraft-chart__corner">
                        {metricNames[metric]} / 年份
                    </span>
                    {flightRecordsByYear.map(
                        (flightYearGroup: FlightYearGroup): ReactElement => (
                            <strong
                                className="flight-aircraft-chart__year"
                                key={flightYearGroup.year}
                            >
                                {flightYearGroup.year}
                            </strong>
                        ),
                    )}
                    {metricValues.flatMap((value): ReactElement[] => [
                        <strong
                            className="flight-aircraft-chart__label"
                            key={`label-${value}`}
                        >
                            {value}
                        </strong>,
                        ...flightRecordsByYear.map(
                            (flightYearGroup: FlightYearGroup): ReactElement => {
                                const count = countMetric(flightYearGroup, value);

                                return (
                                    <span
                                        className="flight-aircraft-chart__cell"
                                        key={`${flightYearGroup.year}-${value}`}
                                        style={{
                                            opacity:
                                                count === 0
                                                    ? 0.35
                                                    : 0.35 + (count / maxMetricCount) * 0.65,
                                        }}
                                        title={`${flightYearGroup.year} 年 ${value}：${count} 次`}
                                    >
                                        {count || "·"}
                                    </span>
                                );
                            },
                        ),
                    ])}
                </div>
            </div>
            <table className="sr-only">
                <caption>各年份乘机{metricNames[metric]}及次数</caption>
                <thead>
                    <tr>
                        <th scope="col">年份</th>
                        <th scope="col">机型</th>
                        <th scope="col">次数</th>
                    </tr>
                </thead>
                <tbody>
                    {flightRecordsByYear.flatMap(
                        (flightYearGroup: FlightYearGroup): ReactElement[] =>
                            metricValues.map(
                                (value): ReactElement => (
                                    <tr key={`aircraft-table-${flightYearGroup.year}-${value}`}>
                                        <th scope="row">{flightYearGroup.year}</th>
                                        <td>{value}</td>
                                        <td>{countMetric(flightYearGroup, value)}</td>
                                    </tr>
                                ),
                            ),
                    )}
                </tbody>
            </table>
        </section>
    );
};

/**
 * 个人档案乘机台账：按年份分组展示航司、机型、航线与日期。
 */
const PersonalFlightRecordsSection = (): ReactElement => {
    /** 当前展开的年份；`undefined` 表示全部折叠。 */
    const [expandedFlightYear, setExpandedFlightYear] = useState<
        number | undefined
    >(undefined);

    // 手风琴切换：同一时刻仅保留一个展开年份，再次点击已展开项则折叠。
    const toggleFlightYear = (flightYear: number): void => {
        setExpandedFlightYear(
            (currentExpandedFlightYear: number | undefined): number | undefined =>
                currentExpandedFlightYear === flightYear ? undefined : flightYear,
        );
    };

    return (
        <section
            className="personal-section"
            aria-labelledby="flight-records-title"
        >
            <div className="personal-section__header">
                <p className="personal-section__eyebrow">Flight Records</p>
                <h2 id="flight-records-title">乘坐过的航司与机型</h2>
            </div>

            <div className="flight-ledger">
                <div className="flight-ledger__toolbar" aria-label="乘机记录统计">
                    <div className="flight-ledger__stats">
                        <span>
                            <strong>{FLIGHT_RECORD_COUNT}</strong>
                            次乘机
                        </span>
                        <span>
                            <strong>{FLIGHT_AIRLINE_COUNT}</strong>
                            家航司
                        </span>
                        <span>
                            <strong>{FLIGHT_AIRCRAFT_TYPE_COUNT}</strong>
                            种机型
                        </span>
                    </div>
                </div>

                <FlightRecordsYearChart />
                <FlightRecordsAircraftChart />

                <div className="flight-ledger__body">
                    {flightRecordsByYear.map(
                        (flightYearGroup: FlightYearGroup): ReactElement => {
                            const isFlightYearExpanded =
                                expandedFlightYear === flightYearGroup.year;
                            const flightYearPanelId = `flight-year-panel-${flightYearGroup.year}`;

                            return (
                                <article
                                    className={`flight-year-block${isFlightYearExpanded ? " flight-year-block--expanded" : ""}`}
                                    key={flightYearGroup.year}
                                    aria-labelledby={`flight-year-${flightYearGroup.year}`}
                                >
                                    <header className="flight-year-block__header">
                                        <button
                                            className="flight-year-block__toggle"
                                            type="button"
                                            aria-controls={flightYearPanelId}
                                            aria-expanded={isFlightYearExpanded}
                                            onClick={(): void =>
                                                toggleFlightYear(flightYearGroup.year)
                                            }
                                        >
                                            <span
                                                className="flight-year-block__label"
                                                id={`flight-year-${flightYearGroup.year}`}
                                            >
                                                {flightYearGroup.year}
                                            </span>
                                            <span className="flight-year-block__meta">
                                                {flightYearGroup.records.length} 次
                                            </span>
                                            <span
                                                className="flight-year-block__indicator"
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </header>

                                    <div
                                        className="flight-year-block__body"
                                        id={flightYearPanelId}
                                        aria-hidden={!isFlightYearExpanded}
                                    >
                                        <ul className="flight-ledger-table">
                                            {flightYearGroup.records.map(
                                                (
                                                    flightRecord: FlightRecord,
                                                    flightRecordIndex: number,
                                                ): ReactElement => {
                                                    const isPending = isPendingFlight(
                                                        flightRecord.departureDate,
                                                    );

                                                    return (
                                                        <li
                                                            className="flight-ledger-row"
                                                            key={`${flightRecord.airline}-${flightRecord.aircraft}-${flightRecord.departureDate}-${flightRecordIndex}`}
                                                        >
                                                            <div className="flight-ledger-row__identity">
                                                                <div className="flight-ledger-row__airline-group">
                                                                    <span className="flight-ledger-row__airline">
                                                                        {flightRecord.airline}
                                                                    </span>
                                                                    {isPending ? (
                                                                        <span className="flight-ledger-row__status">
                                                                            待出行
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                                <span className="flight-ledger-row__aircraft">
                                                                    {flightRecord.aircraft}
                                                                </span>
                                                            </div>
                                                            <div className="flight-ledger-row__route">
                                                                <span className="flight-ledger-row__route-point">
                                                                    {flightRecord.origin}
                                                                </span>
                                                                <span
                                                                    className="flight-ledger-row__route-connector"
                                                                    aria-hidden="true"
                                                                >
                                                                    {getFlightRouteSeparator(flightRecord)}
                                                                </span>
                                                                <span className="flight-ledger-row__route-point">
                                                                    {flightRecord.destination}
                                                                </span>
                                                            </div>
                                                            <time
                                                                className="flight-ledger-row__date"
                                                                dateTime={flightRecord.departureDate}
                                                            >
                                                                <span className="flight-ledger-row__date-label">
                                                                    日期
                                                                </span>
                                                                <span className="flight-ledger-row__date-value">
                                                                    {formatFlightDate(flightRecord)}
                                                                </span>
                                                            </time>
                                                        </li>
                                                    );
                                                },
                                            )}
                                        </ul>
                                    </div>
                                </article>
                            );
                        },
                    )}
                </div>
            </div>
        </section>
    );
};

export default PersonalFlightRecordsSection;
