import { useEffect, useRef, type ReactElement } from "react";
import {
    AIRCRAFT_MODEL_ASSETS,
    type AircraftModelAsset,
} from "./modelAssets";

/** 模型目录组件的当前选择和回传回调。 */
interface ModelDirProps {
    /** 当前页面选中的模型 ID，用于同步多选 active 状态。 */
    selectedModelIds: readonly string[];
    /** 用户点击目录模型后通知父页面切换选择状态。 */
    onModelSelection: (modelId: string) => void;
}

/** 按模型所属目录组织后的目录分组。 */
interface ModelDirectoryGroup {
    /** 目录相对路径，作为分组标题和稳定 key。 */
    directory: string;
    /** 当前目录下的模型资源，保留原始目录顺序。 */
    assets: readonly AircraftModelAsset[];
}

/** 将资源清单按所属目录分组，同时保留首次出现的目录顺序。 */
const groupAssetsByDirectory = (
    assets: readonly AircraftModelAsset[],
): ModelDirectoryGroup[] => {
    const groups = new Map<string, AircraftModelAsset[]>();

    assets.forEach((asset: AircraftModelAsset): void => {
        const directoryAssets = groups.get(asset.sourceDirectory);

        if (directoryAssets === undefined) {
            groups.set(asset.sourceDirectory, [asset]);
            return;
        }

        directoryAssets.push(asset);
    });

    return Array.from(
        groups,
        ([directory, groupedAssets]): ModelDirectoryGroup => ({
            directory,
            assets: groupedAssets,
        }),
    );
};

const MODEL_DIRECTORY_GROUPS = groupAssetsByDirectory(AIRCRAFT_MODEL_ASSETS);

/** 判断模型是否处于目录多选状态。 */
const isModelSelected = (
    selectedModelIds: readonly string[],
    modelId: string,
): boolean => selectedModelIds.includes(modelId);

/** 在当前选中模型不在目录可视区域时，仅滚动目录容器以显示该条目。 */
const scrollSelectedModelIntoView = (
    catalogList: HTMLDivElement,
    selectedModelButton: HTMLButtonElement,
): void => {
    const catalogListBounds = catalogList.getBoundingClientRect();
    const selectedModelBounds = selectedModelButton.getBoundingClientRect();
    const isSelectedModelVisible =
        selectedModelBounds.top >= catalogListBounds.top &&
        selectedModelBounds.bottom <= catalogListBounds.bottom;

    if (isSelectedModelVisible) {
        return;
    }

    const targetScrollTop = Math.max(
        0,
        catalogList.scrollTop +
            selectedModelBounds.top -
            catalogListBounds.top -
            (catalogList.clientHeight - selectedModelBounds.height) / 2,
    );
    const behavior: ScrollBehavior = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
    ).matches
        ? "auto"
        : "smooth";

    catalogList.scrollTo({ top: targetScrollTop, behavior });
};

/** 独立维护 GLB 模型目录的展示和选择交互。 */
export const ModelDir = ({
    selectedModelIds,
    onModelSelection,
}: ModelDirProps): ReactElement => {
    const catalogListRef = useRef<HTMLDivElement | null>(null);
    const selectedModelButtonRef = useRef<HTMLButtonElement | null>(null);
    const primarySelectedModelId = selectedModelIds[0] ?? "";

    /** 在刷新、历史导航或模型选择后保持当前条目处于目录可视区域。 */
    useEffect((): void => {
        const catalogList = catalogListRef.current;
        const selectedModelButton = selectedModelButtonRef.current;

        if (catalogList === null || selectedModelButton === null) {
            return;
        }

        scrollSelectedModelIntoView(catalogList, selectedModelButton);
    }, [primarySelectedModelId]);

    return (
        <aside className="plane-render__catalog" aria-label="模型目录">
            <div className="plane-render__catalog-heading">
                <div>
                    <p className="plane-render__catalog-label">模型目录</p>
                    <h2>
                        {selectedModelIds.length} / {AIRCRAFT_MODEL_ASSETS.length} 个已选
                    </h2>
                </div>
            </div>
            <div
                ref={catalogListRef}
                className="plane-render__catalog-list scroll-area-night"
            >
                {MODEL_DIRECTORY_GROUPS.map(
                    (group): ReactElement => (
                        <section
                            key={group.directory}
                            className="plane-render__model-group"
                            aria-labelledby={`plane-render-directory-${group.directory}`}
                        >
                            <h3
                                id={`plane-render-directory-${group.directory}`}
                                className="plane-render__model-group-heading"
                            >
                                {group.directory}
                            </h3>
                            <div className="plane-render__model-group-list">
                                {group.assets.map(
                                    (asset): ReactElement => (
                                        <button
                                            key={asset.id}
                                            ref={
                                                primarySelectedModelId === asset.id
                                                    ? selectedModelButtonRef
                                                    : null
                                            }
                                            className={`plane-render__model-button${isModelSelected(selectedModelIds, asset.id) ? " plane-render__model-button--active" : ""}`}
                                            type="button"
                                            aria-pressed={isModelSelected(
                                                selectedModelIds,
                                                asset.id,
                                            )}
                                            onClick={(): void =>
                                                onModelSelection(asset.id)
                                            }
                                        >
                                            <span
                                                className="plane-render__model-selection-mark"
                                                aria-hidden="true"
                                            />
                                            <span>{asset.label}</span>
                                            {/* <small>{asset.sourcePath}</small> */}
                                        </button>
                                    ),
                                )}
                            </div>
                        </section>
                    ),
                )}
            </div>
        </aside>
    );
};

export default ModelDir;
