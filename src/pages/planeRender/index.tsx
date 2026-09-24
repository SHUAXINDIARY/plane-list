import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactElement,
} from "react";
import { useSearchParams } from "react-router";
import {
    AircraftModelViewport,
    type AircraftModelLoadingProgress,
} from "./AircraftModelViewport";
import ModelDir from "./ModelDir";
import { AIRCRAFT_MODEL_ASSETS } from "./modelAssets";
import "./index.css";

/** 页面加载模型时使用的初始进度状态。 */
const INITIAL_LOADING_PROGRESS: AircraftModelLoadingProgress = {
    phase: "initializing",
    loadedModelCount: 0,
    failedModelCount: 0,
    totalModelCount: 1,
    rendererStatus: "initializing",
    loadingStage: "renderer",
    modelDimensions: [],
};

/** 用户切换模型后立即呈现的加载状态，避免旧模型状态延迟停留。 */
const MODEL_SWITCHING_PROGRESS: AircraftModelLoadingProgress = {
    phase: "loading",
    loadedModelCount: 0,
    failedModelCount: 0,
    totalModelCount: 1,
    rendererStatus: "initializing",
    loadingStage: "renderer",
    modelDimensions: [],
};

/** 页面首次打开时默认渲染模型目录中的第一架飞机。 */
const INITIAL_SELECTED_MODEL_IDS = AIRCRAFT_MODEL_ASSETS[0]
    ? [AIRCRAFT_MODEL_ASSETS[0].id]
    : [];

/** 当前模型在 URL 查询参数中使用的键名。 */
const SELECTED_MODELS_QUERY_PARAMETER = "models";
const LEGACY_SELECTED_MODEL_QUERY_PARAMETER = "model";

/** 根据加载阶段生成页面内的状态标题。 */
const getLoadingStatusTitle = (
    progress: AircraftModelLoadingProgress,
): string => {
    if (progress.phase === "initializing") {
        return "正在初始化 WebGPU";
    }

    if (progress.phase === "loading") {
        return progress.loadingStage === "parsing"
            ? "正在解析选中的模型"
            : "正在载入选中的模型";
    }

    if (progress.phase === "error") {
        return "模型视窗不可用";
    }

    return "当前模型已就绪";
};

/** 根据加载阶段和可用字节进度生成页面内的状态说明。 */
const getLoadingStatusDescription = (
    progress: AircraftModelLoadingProgress,
): string => {
    if (progress.message !== undefined) {
        return progress.message;
    }

    if (progress.loadingStage === "downloading") {
        if (progress.progressRatio !== undefined) {
            return `资源下载 ${Math.round(progress.progressRatio * 100)}%`;
        }

        return "资源大小未知，正在下载";
    }

    if (progress.loadingStage === "parsing") {
        return "正在解析 GLB 场景";
    }

    return `${progress.loadedModelCount} / ${progress.totalModelCount} 个模型`;
};

/** 将渲染后端状态转换为状态栏中的可读文本。 */
const getRendererStatusLabel = (
    progress: AircraftModelLoadingProgress,
): string => {
    if (progress.rendererStatus === "initializing") {
        return "初始化中";
    }

    if (progress.rendererStatus === "unavailable") {
        return "不可用";
    }

    if (progress.rendererStatus === "lost") {
        return "设备丢失";
    }

    return "WebGPU 已就绪";
};

/** 从 URL 读取有效的模型 ID；缺失或失效时回退到目录中的默认模型。 */
const getSelectedModelIdsFromSearchParams = (
    searchParams: URLSearchParams,
): string[] => {
    const requestedModelIds = searchParams
        .getAll(SELECTED_MODELS_QUERY_PARAMETER)
        .flatMap((value: string): string[] => value.split(","))
        .concat(
            searchParams.get(LEGACY_SELECTED_MODEL_QUERY_PARAMETER) ?? [],
        );
    const validModelIds = requestedModelIds.filter(
        (modelId: string): boolean =>
            AIRCRAFT_MODEL_ASSETS.some((asset): boolean => asset.id === modelId),
    );
    const uniqueModelIds = Array.from(new Set(validModelIds));

    return uniqueModelIds.length > 0
        ? uniqueModelIds
        : [...INITIAL_SELECTED_MODEL_IDS];
};

/** 保留其他页面查询参数，并写入当前模型的稳定选择标识。 */
const createSearchParamsWithSelectedModel = (
    searchParams: URLSearchParams,
    selectedModelIds: readonly string[],
): URLSearchParams => {
    const nextSearchParams = new URLSearchParams(searchParams);

    nextSearchParams.delete(SELECTED_MODELS_QUERY_PARAMETER);
    nextSearchParams.delete(LEGACY_SELECTED_MODEL_QUERY_PARAMETER);
    nextSearchParams.set(
        SELECTED_MODELS_QUERY_PARAMETER,
        selectedModelIds.join(","),
    );

    return nextSearchParams;
};

/**
 * 使用 WebGPU 同时渲染多个选中的飞机模型，并展示原始尺寸对比。
 */
const PlaneRenderPage = (): ReactElement => {
    const viewportRef = useRef<HTMLElement | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedModelIds = getSelectedModelIdsFromSearchParams(searchParams);
    const selectedModelIdsRef = useRef<readonly string[]>(selectedModelIds);
    const [loadingProgress, setLoadingProgress] =
        useState<AircraftModelLoadingProgress>(INITIAL_LOADING_PROGRESS);
    const [retryToken, setRetryToken] = useState<number>(0);

    /** 将缺失或无效模型参数替换为当前可加载的默认选择。 */
    useEffect((): void => {
        const requestedModelsValue = searchParams.get(
            SELECTED_MODELS_QUERY_PARAMETER,
        );

        if (
            selectedModelIds.length === 0 ||
            requestedModelsValue === selectedModelIds.join(",")
        ) {
            return;
        }

        setSearchParams(
            createSearchParamsWithSelectedModel(searchParams, selectedModelIds),
            { replace: true },
        );
    }, [searchParams, selectedModelIds, setSearchParams]);

    /** 响应浏览器前进和后退造成的模型 query 变化，及时清除旧模型状态。 */
    useEffect((): void => {
        if (
            selectedModelIdsRef.current.length === selectedModelIds.length &&
            selectedModelIdsRef.current.every(
                (modelId: string, index: number): boolean =>
                    modelId === selectedModelIds[index],
            )
        ) {
            return;
        }

        selectedModelIdsRef.current = selectedModelIds;
        setLoadingProgress({
            ...MODEL_SWITCHING_PROGRESS,
            totalModelCount: selectedModelIds.length,
        });
    }, [selectedModelIds]);

    /** 接收视窗的异步进度更新，驱动目录与状态区显示。 */
    const handleLoadingProgressChange = useCallback(
        (progress: AircraftModelLoadingProgress): void => {
            setLoadingProgress(progress);
        },
        [],
    );

    /** 切换当前模型，并在点击提交的同一帧反馈新模型正在载入。 */
    const handleModelSelection = (modelId: string): void => {
        if (
            !AIRCRAFT_MODEL_ASSETS.some(
                (asset): boolean => asset.id === modelId,
            )
        ) {
            return;
        }

        const nextSelectedModelIds = selectedModelIds.includes(modelId)
            ? selectedModelIds.filter((selectedId): boolean => selectedId !== modelId)
            : [...selectedModelIds, modelId];

        if (nextSelectedModelIds.length === 0) {
            return;
        }

        setLoadingProgress({
            ...MODEL_SWITCHING_PROGRESS,
            totalModelCount: nextSelectedModelIds.length,
        });
        selectedModelIdsRef.current = nextSelectedModelIds;
        setSearchParams(
            createSearchParamsWithSelectedModel(
                searchParams,
                nextSelectedModelIds,
            ),
        );
    };

    /** 重新初始化当前模型视窗，并立即清除旧错误状态。 */
    const handleModelRetry = (): void => {
        if (selectedModelIds.length === 0) {
            return;
        }

        setLoadingProgress({
            ...MODEL_SWITCHING_PROGRESS,
            totalModelCount: selectedModelIds.length,
        });
        setRetryToken((currentToken: number): number => currentToken + 1);
    };

    const selectedModels = useMemo(
        () =>
            AIRCRAFT_MODEL_ASSETS.filter((asset): boolean =>
                selectedModelIds.includes(asset.id),
            ),
        [selectedModelIds.join(",")],
    );
    const selectedModelSummary =
        selectedModels.map((asset) => asset.label).join("、") || "暂无模型";
    const hasFailedModels = loadingProgress.failedModelCount > 0;
    const isModelLoading =
        loadingProgress.phase === "initializing" ||
        loadingProgress.phase === "loading";

    return (
        <section
            className="page-panel plane-render"
            aria-labelledby="plane-render-heading"
        >
            <header className="plane-render__header">
                <p className="page-eyebrow">Model Studio</p>
                <h1 id="plane-render-heading">飞机模型渲染</h1>
                <p>选择多个 GLB 机型，在同一视窗中按比例检查外形与尺寸。</p>
            </header>

            <div className="plane-render__workspace">
                <section
                    ref={viewportRef}
                    className="plane-render__viewport"
                    aria-label="WebGPU 三维模型视窗，支持拖拽旋转、滚动缩放和多机型尺寸对比"
                    aria-busy={isModelLoading}
                    data-loading={isModelLoading}
                >
                    <AircraftModelViewport
                        assets={selectedModels}
                        selectedModelIds={selectedModelIds}
                        onLoadingProgressChange={handleLoadingProgressChange}
                        onModelSelection={handleModelSelection}
                        fullscreenTargetRef={viewportRef}
                        retryToken={retryToken}
                    />
                    {loadingProgress.phase !== "ready" ? (
                        <div
                            className={`plane-render__viewport-status plane-render__viewport-status--${loadingProgress.phase}`}
                            role={
                                loadingProgress.phase === "error"
                                    ? "alert"
                                    : "status"
                            }
                        >
                            <strong>
                                {getLoadingStatusTitle(loadingProgress)}
                            </strong>
                            <span>
                                {getLoadingStatusDescription(loadingProgress)}
                            </span>
                            {loadingProgress.phase === "error" &&
                            selectedModels.length > 0 ? (
                                <button
                                    className="plane-render__retry-button"
                                    type="button"
                                    onClick={handleModelRetry}
                                >
                                    重试选中模型
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                    <p
                        className="plane-render__viewport-caption"
                        aria-live="polite"
                    >
                        {selectedModelSummary}
                    </p>
                </section>

                <ModelDir
                    selectedModelIds={selectedModelIds}
                    onModelSelection={handleModelSelection}
                />
            </div>

            <dl className="plane-render__status-list">
                <div>
                    <dt>目录模型</dt>
                    <dd>{AIRCRAFT_MODEL_ASSETS.length} 个</dd>
                </div>
                <div>
                    <dt>已载入</dt>
                    <dd>
                        {loadingProgress.loadedModelCount} /{" "}
                        {loadingProgress.totalModelCount}
                    </dd>
                </div>
                <div>
                    <dt>渲染状态</dt>
                    <dd>{getRendererStatusLabel(loadingProgress)}</dd>
                </div>
            </dl>
            {hasFailedModels ? (
                <p className="plane-render__load-note" role="status">
                    {loadingProgress.failedModelCount} 个模型未能加载。
                </p>
            ) : null}
            {loadingProgress.modelDimensions.length > 0 ? (
                <section
                    className="plane-render__dimensions"
                    aria-labelledby="plane-render-dimensions-heading"
                >
                    <div className="plane-render__dimensions-heading">
                        <p className="plane-render__catalog-label">尺寸对比</p>
                        <h2 id="plane-render-dimensions-heading">
                            原始包围盒，单位随模型资源
                        </h2>
                    </div>
                    <div className="plane-render__dimensions-table-wrap">
                        <table className="plane-render__dimensions-table">
                            <thead>
                                <tr>
                                    <th scope="col">机型</th>
                                    <th scope="col">长</th>
                                    <th scope="col">宽</th>
                                    <th scope="col">高</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingProgress.modelDimensions.map(
                                    (dimension) => (
                                        <tr key={dimension.modelId}>
                                            <th scope="row">
                                                {dimension.label}
                                            </th>
                                            <td>{dimension.length.toFixed(2)}</td>
                                            <td>{dimension.width.toFixed(2)}</td>
                                            <td>{dimension.height.toFixed(2)}</td>
                                        </tr>
                                    ),
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            ) : null}
            <p className="plane-render__attribution">
                模型资源由{" "}
                {/* <a
                    href="https://github.com/amvlab/aircraft-models"
                    target="_blank"
                    rel="noreferrer"
                >
                    amvlab
                </a>
                {"、"} */}
                <a
                    href="https://github.com/Flightradar24/fr24-3d-models"
                    target="_blank"
                    rel="noreferrer"
                >
                    fr24-3d-models
                </a>{"、"}
                <a
                    href="https://sketchfab.com"
                    target="_blank"
                    rel="noreferrer"
                >
                    sketchfab
                </a>{" "}
                提供。
            </p>
        </section>
    );
};

export default PlaneRenderPage;
