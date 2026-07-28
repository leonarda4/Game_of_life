import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import seaVideo from '../data/sea.mov'

const BASE_GRID_SIZE = 12
const PATTERN_PADDING = 2
const GOO_BLEED = 0.55
const BOARD_WORDS = ['Game', 'of', 'life']
const WORD_HEIGHT_IN_CELLS = 2
const WORD_PADDING_PX = 8
const WORD_LETTER_SPACING_EM = -0.08
const WORD_FONT = 'Helvetica, Arial, sans-serif'
const WORD_FONT_WEIGHT = 700
const PULSAR_PATTERN = [
    '..***...***..',
    '.............',
    '*....*.*....*',
    '*....*.*....*',
    '*....*.*....*',
    '..***...***..',
    '.............',
    '..***...***..',
    '*....*.*....*',
    '*....*.*....*',
    '*....*.*....*',
    '.............',
    '..***...***..',
]
const GRID_SIZE = Math.max(BASE_GRID_SIZE, PULSAR_PATTERN.length + PATTERN_PADDING * 2)

function createGrid(rows, cols, random = false) {
    return Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => (random ? (Math.random() > 0.7 ? 1 : 0) : 0)),
    )
}

function createPatternGrid(pattern, gridSize) {
    const rowCount = pattern.length
    const colCount = pattern[0].length
    const size = Math.max(gridSize, rowCount + PATTERN_PADDING * 2, colCount + PATTERN_PADDING * 2)
    const nextGrid = createGrid(size, size)
    const rowOffset = Math.floor((size - rowCount) / 2)
    const colOffset = Math.floor((size - colCount) / 2)

    pattern.forEach((patternRow, rowIndex) => {
        patternRow.split('').forEach((cell, colIndex) => {
            if (cell === '*') {
                nextGrid[rowOffset + rowIndex][colOffset + colIndex] = 1
            }
        })
    })

    return nextGrid
}

function countNeighbors(grid, row, col) {
    let count = 0
    for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) continue
            const nextRow = row + dr
            const nextCol = col + dc
            if (nextRow >= 0 && nextRow < grid.length && nextCol >= 0 && nextCol < grid[0].length) {
                count += grid[nextRow][nextCol]
            }
        }
    }
    return count
}

function nextGeneration(grid) {
    return grid.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
            const neighbors = countNeighbors(grid, rowIndex, colIndex)
            if (cell === 1) {
                return neighbors === 2 || neighbors === 3 ? 1 : 0
            }
            return neighbors === 3 ? 1 : 0
        }),
    )
}

function getTextMeasureContext() {
    if (typeof document === 'undefined') return null

    if (!getTextMeasureContext.canvas) {
        getTextMeasureContext.canvas = document.createElement('canvas')
    }

    return getTextMeasureContext.canvas.getContext('2d')
}

function measureWordFootprint(word, cellSize) {
    const targetTextHeight = cellSize * WORD_HEIGHT_IN_CELLS
    const fallbackWidth = word.length * cellSize * 0.9
    const fallbackHeight = targetTextHeight
    const context = getTextMeasureContext()

    if (!context) {
        return {
            word,
            fontSize: targetTextHeight,
            textWidth: fallbackWidth,
            textHeight: fallbackHeight,
            widthCells: Math.max(1, Math.ceil((fallbackWidth + WORD_PADDING_PX * 2) / cellSize)),
            heightCells: Math.max(1, Math.ceil((fallbackHeight + WORD_PADDING_PX * 2) / cellSize)),
        }
    }

    const baseFontSize = 100
    context.font = `${WORD_FONT_WEIGHT} ${baseFontSize}px ${WORD_FONT}`

    const baseMetrics = context.measureText(word)
    const baseHeight =
        (baseMetrics.actualBoundingBoxAscent || baseFontSize * 0.72) +
        (baseMetrics.actualBoundingBoxDescent || baseFontSize * 0.18)
    const fontSize = (targetTextHeight / baseHeight) * baseFontSize

    context.font = `${WORD_FONT_WEIGHT} ${fontSize}px ${WORD_FONT}`

    const metrics = context.measureText(word)
    const textHeight =
        (metrics.actualBoundingBoxAscent || fontSize * 0.72) +
        (metrics.actualBoundingBoxDescent || fontSize * 0.18)
    const textWidth = metrics.width + Math.max(0, word.length - 1) * fontSize * WORD_LETTER_SPACING_EM

    return {
        word,
        fontSize,
        textWidth,
        textHeight,
        widthCells: Math.max(1, Math.ceil((textWidth + WORD_PADDING_PX * 2) / cellSize)),
        heightCells: Math.max(1, Math.ceil((textHeight + WORD_PADDING_PX * 2) / cellSize)),
    }
}

function areaIsEmpty(occupied, rowStart, colStart, height, width) {
    for (let row = rowStart; row < rowStart + height; row += 1) {
        for (let col = colStart; col < colStart + width; col += 1) {
            if (occupied[row][col]) {
                return false
            }
        }
    }

    return true
}

function reserveArea(occupied, rowStart, colStart, height, width) {
    for (let row = rowStart; row < rowStart + height; row += 1) {
        for (let col = colStart; col < colStart + width; col += 1) {
            occupied[row][col] = true
        }
    }
}

function countOccupiedCells(occupied, rowStart, colStart, height, width) {
    let conflicts = 0

    for (let row = rowStart; row < rowStart + height; row += 1) {
        for (let col = colStart; col < colStart + width; col += 1) {
            if (occupied[row][col]) {
                conflicts += 1
            }
        }
    }

    return conflicts
}

function clearArea(grid, rowStart, colStart, height, width) {
    for (let row = rowStart; row < rowStart + height; row += 1) {
        for (let col = colStart; col < colStart + width; col += 1) {
            grid[row][col] = 0
        }
    }
}

function expandGridToSize(grid, targetSize) {
    if (grid.length >= targetSize) {
        return grid.map((row) => [...row])
    }

    const nextGrid = createGrid(targetSize, targetSize)
    const rowOffset = Math.floor((targetSize - grid.length) / 2)
    const colOffset = Math.floor((targetSize - grid[0].length) / 2)

    grid.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
            nextGrid[rowOffset + rowIndex][colOffset + colIndex] = cell
        })
    })

    return nextGrid
}

function findWordPlacement(occupied, widthCells, heightCells, preferredRow, allowClear = false) {
    const rows = occupied.length
    const cols = occupied[0].length
    const maxRow = rows - heightCells
    const maxCol = cols - widthCells
    const preferredCol = Math.max(0, Math.floor((cols - widthCells) / 2))
    let bestPlacement = null

    for (let row = 0; row <= maxRow; row += 1) {
        for (let col = 0; col <= maxCol; col += 1) {
            const conflicts = countOccupiedCells(occupied, row, col, heightCells, widthCells)

            if (!allowClear && conflicts > 0) {
                continue
            }

            const score = conflicts * rows * cols + Math.abs(row - preferredRow) * 2 + Math.abs(col - preferredCol)

            if (!bestPlacement || score < bestPlacement.score) {
                bestPlacement = { row, col, score, conflicts }
            }
        }
    }

    return bestPlacement
}

function gridsEqual(leftGrid, rightGrid) {
    if (leftGrid.length !== rightGrid.length || leftGrid[0].length !== rightGrid[0].length) {
        return false
    }

    for (let row = 0; row < leftGrid.length; row += 1) {
        for (let col = 0; col < leftGrid[row].length; col += 1) {
            if (leftGrid[row][col] !== rightGrid[row][col]) {
                return false
            }
        }
    }

    return true
}

function wordLayoutsEqual(leftLayouts, rightLayouts) {
    if (leftLayouts.length !== rightLayouts.length) {
        return false
    }

    return leftLayouts.every((leftLayout, index) => {
        const rightLayout = rightLayouts[index]

        return (
            leftLayout.word === rightLayout.word &&
            leftLayout.row === rightLayout.row &&
            leftLayout.col === rightLayout.col &&
            leftLayout.widthCells === rightLayout.widthCells &&
            leftLayout.heightCells === rightLayout.heightCells &&
            leftLayout.fontSize === rightLayout.fontSize &&
            leftLayout.textWidth === rightLayout.textWidth &&
            leftLayout.textHeight === rightLayout.textHeight
        )
    })
}

function resolveWordLayouts(grid, wordFootprints) {
    const requiredSize = Math.max(
        grid.length,
        ...wordFootprints.flatMap((footprint) => [footprint.widthCells, footprint.heightCells]),
    )
    const nextGrid = expandGridToSize(grid, requiredSize)
    const occupied = nextGrid.map((row) => row.map((cell) => cell === 1))
    const wordLayouts = []

    wordFootprints.forEach((footprint, index) => {
        const preferredRow = Math.round(
            ((nextGrid.length - footprint.heightCells) * index) / Math.max(1, wordFootprints.length - 1),
        )
        let placement = findWordPlacement(occupied, footprint.widthCells, footprint.heightCells, preferredRow)

        if (!placement) {
            placement = findWordPlacement(occupied, footprint.widthCells, footprint.heightCells, preferredRow, true)
        }

        if (!placement) {
            return
        }

        if (placement.conflicts > 0) {
            clearArea(nextGrid, placement.row, placement.col, footprint.heightCells, footprint.widthCells)
        }

        reserveArea(occupied, placement.row, placement.col, footprint.heightCells, footprint.widthCells)
        wordLayouts.push({
            ...footprint,
            row: placement.row,
            col: placement.col,
        })
    })

    return { grid: nextGrid, wordLayouts }
}

function createRandomizedGrid(gridSize, wordFootprints) {
    const baseGrid = createGrid(gridSize, gridSize)
    const { grid, wordLayouts } = resolveWordLayouts(baseGrid, wordFootprints)
    const reserved = createGrid(grid.length, grid[0].length)

    wordLayouts.forEach((layout) => {
        reserveArea(reserved, layout.row, layout.col, layout.heightCells, layout.widthCells)
    })

    const randomGrid = grid.map((row, rowIndex) =>
        row.map((cell, colIndex) => (reserved[rowIndex][colIndex] ? cell : (Math.random() > 0.7 ? 1 : 0))),
    )

    return { grid: randomGrid, wordLayouts }
}

const BoardVideo = memo(function BoardVideo({ bleedStyle }) {
    const videoRef = useRef(null)

    useEffect(() => {
        const video = videoRef.current

        if (!video) return undefined

        const ensurePlayback = async () => {
            video.defaultMuted = true
            video.muted = true
            video.loop = true

            try {
                await video.play()
            } catch {
                // Autoplay may briefly fail before the media is ready; listeners retry.
            }
        }

        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && video.paused) {
                void ensurePlayback()
            }
        }

        void ensurePlayback()
        video.addEventListener('canplay', ensurePlayback)
        video.addEventListener('loadeddata', ensurePlayback)
        video.addEventListener('ended', ensurePlayback)
        document.addEventListener('visibilitychange', handleVisibility)

        return () => {
            video.removeEventListener('canplay', ensurePlayback)
            video.removeEventListener('loadeddata', ensurePlayback)
            video.removeEventListener('ended', ensurePlayback)
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [])

    return (
        <video
            ref={videoRef}
            className="board-video"
            src={seaVideo}
            style={bleedStyle}
            autoPlay
            defaultMuted
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
        />
    )
})

export default function App() {
    const [grid, setGrid] = useState(() => createPatternGrid(PULSAR_PATTERN, GRID_SIZE))
    const [running, setRunning] = useState(false)
    const [hoveredCell, setHoveredCell] = useState(null)
    const [wordLayouts, setWordLayouts] = useState([])
    const [boardBounds, setBoardBounds] = useState({ width: 0, height: 0 })
    const boardFrameRef = useRef(null)
    const svgToken = useId().replace(/:/g, '')
    const gooFilterId = `${svgToken}-goo-filter`
    const overlayMaskId = `${svgToken}-overlay-mask`
    const rowCount = grid.length
    const colCount = grid[0].length
    const maskX = -GOO_BLEED
    const maskY = -GOO_BLEED
    const maskWidth = colCount + GOO_BLEED * 2
    const maskHeight = rowCount + GOO_BLEED * 2
    const aliveCells = useMemo(
        () =>
            grid.flatMap((row, rowIndex) =>
                row.flatMap((cell, colIndex) => (cell ? [{ rowIndex, colIndex }] : [])),
            ),
        [grid],
    )
    const hoverPreviewCell =
        hoveredCell && grid[hoveredCell.rowIndex]?.[hoveredCell.colIndex] === 0 ? hoveredCell : null
    const bleedStyle = useMemo(
        () => ({
            '--goo-bleed-x': `${(GOO_BLEED / colCount) * 100}%`,
            '--goo-bleed-y': `${(GOO_BLEED / rowCount) * 100}%`,
        }),
        [colCount, rowCount],
    )
    const cellSize = (boardBounds.width || 640) / colCount
    const wordFootprints = useMemo(
        () => BOARD_WORDS.map((word) => measureWordFootprint(word, cellSize)),
        [cellSize],
    )
    const boardWords = useMemo(
        () =>
            wordLayouts.map((layout) => ({
                ...layout,
                left: layout.col * cellSize,
                top: layout.row * cellSize,
                width: layout.widthCells * cellSize,
                height: layout.heightCells * cellSize,
            })),
        [cellSize, wordLayouts],
    )

    useEffect(() => {
        if (!running) return undefined

        const interval = window.setInterval(() => {
            setGrid((currentGrid) => nextGeneration(currentGrid))
        }, 240)

        return () => window.clearInterval(interval)
    }, [running])

    useEffect(() => {
        const { grid: resolvedGrid, wordLayouts: resolvedWordLayouts } = resolveWordLayouts(grid, wordFootprints)

        if (!wordLayoutsEqual(wordLayouts, resolvedWordLayouts)) {
            setWordLayouts(resolvedWordLayouts)
        }

        if (!gridsEqual(grid, resolvedGrid)) {
            setGrid(resolvedGrid)
        }
    }, [grid, wordFootprints, wordLayouts])

    useEffect(() => {
        const boardFrame = boardFrameRef.current

        if (!boardFrame) return undefined

        const updateBounds = () => {
            const nextBounds = {
                width: boardFrame.clientWidth,
                height: boardFrame.clientHeight,
            }

            setBoardBounds((currentBounds) =>
                currentBounds.width === nextBounds.width && currentBounds.height === nextBounds.height
                    ? currentBounds
                    : nextBounds,
            )
        }

        updateBounds()

        const observer = new ResizeObserver(updateBounds)
        observer.observe(boardFrame)

        return () => observer.disconnect()
    }, [])

    const toggleCell = (row, col) => {
        setGrid((currentGrid) =>
            currentGrid.map((gridRow, rowIndex) =>
                gridRow.map((cell, colIndex) => {
                    if (rowIndex === row && colIndex === col) {
                        return cell ? 0 : 1
                    }
                    return cell
                }),
            ),
        )
    }

    const seedPulsar = () => setGrid(createPatternGrid(PULSAR_PATTERN, GRID_SIZE))
    const reset = () => setGrid(createGrid(grid.length, grid[0].length))
    const randomize = () => {
        const { grid: randomizedGrid, wordLayouts: randomizedWordLayouts } = createRandomizedGrid(
            GRID_SIZE,
            wordFootprints,
        )

        setWordLayouts(randomizedWordLayouts)
        setGrid(randomizedGrid)
    }

    return (
        <main className="app-shell">
            <aside className="sidebar left-sidebar">
                <div className="controls">
                    <button onClick={() => setRunning((value) => !value)}>{running ? 'Stop' : 'Start'}</button>
                    <button onClick={() => setGrid((current) => nextGeneration(current))}>Step</button>
                    <button onClick={seedPulsar}>Pulsar</button>
                    <button onClick={randomize}>Randomize</button>
                    <button onClick={reset}>Clear</button>
                </div>
            </aside>

            <section className="center-panel">
                <div ref={boardFrameRef} className="board-frame">
                    <BoardVideo bleedStyle={bleedStyle} />
                    <svg
                        className="life-surface"
                        viewBox={`0 0 ${colCount} ${rowCount}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                    >
                        <defs>
                            <filter
                                id={gooFilterId}
                                x="-18%"
                                y="-18%"
                                width="136%"
                                height="136%"
                                colorInterpolationFilters="sRGB"
                            >
                                <feMorphology in="SourceGraphic" operator="dilate" radius="0.12" result="expanded" />
                                <feGaussianBlur in="expanded" stdDeviation="0.22" result="blurred" />
                                <feColorMatrix
                                    in="blurred"
                                    mode="matrix"
                                    values="
                                        1 0 0 0 0
                                        0 1 0 0 0
                                        0 0 1 0 0
                                        0 0 0 40 -30
                                    "
                                    result="goo"
                                />
                            </filter>
                            <mask
                                id={overlayMaskId}
                                x={maskX}
                                y={maskY}
                                width={maskWidth}
                                height={maskHeight}
                                maskUnits="userSpaceOnUse"
                                maskContentUnits="userSpaceOnUse"
                            >
                                <rect x={maskX} y={maskY} width={maskWidth} height={maskHeight} fill="white" />
                                <g filter={`url(#${gooFilterId})`}>
                                    {aliveCells.map(({ rowIndex, colIndex }) => (
                                        <rect
                                            key={`blob-${rowIndex}-${colIndex}`}
                                            x={colIndex}
                                            y={rowIndex}
                                            width="1"
                                            height="1"
                                            rx="0.28"
                                            ry="0.28"
                                            fill="black"
                                        />
                                    ))}
                                </g>
                            </mask>
                        </defs>
                        <rect
                            x={maskX}
                            y={maskY}
                            width={maskWidth}
                            height={maskHeight}
                            fill="white"
                            mask={`url(#${overlayMaskId})`}
                        />
                        {hoverPreviewCell ? (
                            <g className="hover-preview" filter={`url(#${gooFilterId})`}>
                                <rect
                                    x={hoverPreviewCell.colIndex}
                                    y={hoverPreviewCell.rowIndex}
                                    width="1"
                                    height="1"
                                    rx="0.28"
                                    ry="0.28"
                                    fill="#111"
                                />
                            </g>
                        ) : null}
                    </svg>
                    <div className="board-word-layer" aria-hidden="true">
                        {boardWords.map((wordLayout) => (
                            <div
                                key={wordLayout.word}
                                className="board-word"
                                style={{
                                    left: `${wordLayout.left}px`,
                                    top: `${wordLayout.top}px`,
                                    width: `${wordLayout.width}px`,
                                    height: `${wordLayout.height}px`,
                                    padding: `${WORD_PADDING_PX}px`,
                                    fontSize: `${wordLayout.fontSize}px`,
                                }}
                            >
                                <span className="board-word-label">{wordLayout.word}</span>
                            </div>
                        ))}
                    </div>
                    <div
                        className="grid"
                        style={{ '--grid-size': rowCount }}
                        role="grid"
                        aria-label="Game of Life board"
                        onMouseLeave={() => setHoveredCell(null)}
                    >
                        {grid.map((row, rowIndex) =>
                            row.map((cell, colIndex) => (
                                <button
                                    key={`${rowIndex}-${colIndex}`}
                                    className={`cell ${cell ? 'alive' : 'dead'}`}
                                    onMouseEnter={() => setHoveredCell({ rowIndex, colIndex })}
                                    onFocus={() => setHoveredCell({ rowIndex, colIndex })}
                                    onClick={() => toggleCell(rowIndex, colIndex)}
                                    aria-label={`Cell ${rowIndex}, ${colIndex}`}
                                />
                            )),
                        )}
                    </div>
                </div>
            </section>

            <aside className="sidebar right-sidebar">
                <div className="content-block">
                    <h2>About</h2>
                    <p>Conway&apos;s Game of Life is a cellular automaton devised by mathematician John Horton Conway in 1970.</p>
                </div>
                <div className="content-block">
                    <h2>Rules</h2>
                    <p>Any live cell with 2–3 neighbors survives. Any dead cell with exactly 3 neighbors becomes alive. All other cells die or stay dead.</p>
                </div>
                <div className="content-block">
                    <h2>Interact</h2>
                    <p>Click cells to seed the board, then press Start to watch the patterns evolve.</p>
                </div>
            </aside>
        </main>
    )
}
