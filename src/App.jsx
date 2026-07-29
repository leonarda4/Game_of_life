import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import sea1Video from '../data/sea1.mp4'
import sea2Video from '../data/sea2.mp4'
import sea3Video from '../data/sea3.mp4'
import sea1Thumbnail from '../data/sea1.mp4.png'
import sea2Thumbnail from '../data/sea2.mp4.png'
import sea3Thumbnail from '../data/sea3.mp4.png'

const BASE_GRID_SIZE = 12
const PATTERN_PADDING = 2
const GOO_BLEED = 0.55
const MASK_BLEED = GOO_BLEED + 0.08
const CELL_RADIUS = 0.28
const GOO_DILATE_RADIUS = 0.12
const GOO_BLUR_RADIUS = 0.22
const GOO_ALPHA_THRESHOLD = 0.75
const EXPORT_TRACE_THRESHOLD = 0.5
const EXPORT_TRACE_SCALE = 96
const EXPORT_TRACE_PADDING_CELLS = 2
const EXPORT_RESAMPLE_SPACING = 0.12
const EXPORT_SMOOTHING_PASSES = 0
const EXPORT_CURVE_TENSION = 0.9
const INK_COLOR = '#15324D'
const EXPORT_WORD_FILL = INK_COLOR
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
const SEA_VIDEOS = [
    { id: 'sea-1', label: 'Sea 1', src: sea1Video, thumbnailSrc: sea1Thumbnail },
    { id: 'sea-2', label: 'Sea 2', src: sea2Video, thumbnailSrc: sea2Thumbnail },
    { id: 'sea-3', label: 'Sea 3', src: sea3Video, thumbnailSrc: sea3Thumbnail },
]

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

function getCellKey(row, col) {
    return `${row}-${col}`
}

function setCellValue(grid, row, col, value) {
    return grid.map((gridRow, rowIndex) => {
        if (rowIndex !== row) {
            return [...gridRow]
        }

        return gridRow.map((cell, colIndex) => (colIndex === col ? value : cell))
    })
}

function drawRoundedRectPath(context, x, y, width, height, radius) {
    const clampedRadius = Math.min(radius, width / 2, height / 2)

    context.beginPath()
    context.moveTo(x + clampedRadius, y)
    context.arcTo(x + width, y, x + width, y + height, clampedRadius)
    context.arcTo(x + width, y + height, x, y + height, clampedRadius)
    context.arcTo(x, y + height, x, y, clampedRadius)
    context.arcTo(x, y, x + width, y, clampedRadius)
    context.closePath()
}

function buildApproximateGooField(aliveCells, rowCount, colCount) {
    if (typeof document === 'undefined') {
        return null
    }

    const scale = EXPORT_TRACE_SCALE
    const padding = EXPORT_TRACE_PADDING_CELLS * scale
    const width = Math.ceil((colCount + EXPORT_TRACE_PADDING_CELLS * 2) * scale)
    const height = Math.ceil((rowCount + EXPORT_TRACE_PADDING_CELLS * 2) * scale)
    const baseCanvas = document.createElement('canvas')
    const blurCanvas = document.createElement('canvas')

    baseCanvas.width = width
    baseCanvas.height = height
    blurCanvas.width = width
    blurCanvas.height = height

    const baseContext = baseCanvas.getContext('2d')
    const blurContext = blurCanvas.getContext('2d', { willReadFrequently: true })

    if (!baseContext || !blurContext) {
        return null
    }

    const expandedRadius = (CELL_RADIUS + GOO_DILATE_RADIUS) * scale
    const expandedCellSize = (1 + GOO_DILATE_RADIUS * 2) * scale

    baseContext.fillStyle = INK_COLOR

    aliveCells.forEach(({ rowIndex, colIndex }) => {
        const x = padding + (colIndex - GOO_DILATE_RADIUS) * scale
        const y = padding + (rowIndex - GOO_DILATE_RADIUS) * scale

        drawRoundedRectPath(baseContext, x, y, expandedCellSize, expandedCellSize, expandedRadius)
        baseContext.fill()
    })

    blurContext.filter = `blur(${GOO_BLUR_RADIUS * scale}px)`
    blurContext.drawImage(baseCanvas, 0, 0)
    blurContext.filter = 'none'

    const imageData = blurContext.getImageData(0, 0, width, height).data
    const field = new Float32Array(width * height)

    for (let index = 0; index < field.length; index += 1) {
        field[index] = imageData[index * 4 + 3] / 255
    }

    return { field, width, height, padding, scale }
}

function buildGooRasterSvgMarkup({ aliveCells, rowCount, colCount, pixelWidth, pixelHeight }) {
    const exportMinX = -GOO_BLEED
    const exportMinY = -GOO_BLEED
    const exportWidthUnits = colCount + GOO_BLEED * 2
    const exportHeightUnits = rowCount + GOO_BLEED * 2
    const cellsMarkup = aliveCells
        .map(
            ({ rowIndex, colIndex }) => `
        <rect
            x="${colIndex}"
            y="${rowIndex}"
            width="1"
            height="1"
            rx="${CELL_RADIUS}"
            ry="${CELL_RADIUS}"
            fill="black"
        />`,
        )
        .join('')

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="${formatSvgNumber(exportMinX)} ${formatSvgNumber(exportMinY)} ${formatSvgNumber(exportWidthUnits)} ${formatSvgNumber(exportHeightUnits)}">
    <defs>
        <filter
            id="export-goo-filter"
            x="-18%"
            y="-18%"
            width="136%"
            height="136%"
            color-interpolation-filters="sRGB"
        >
            <feMorphology
                in="SourceGraphic"
                operator="dilate"
                radius="${GOO_DILATE_RADIUS}"
                result="expanded"
            />
            <feGaussianBlur in="expanded" stdDeviation="${GOO_BLUR_RADIUS}" result="blurred" />
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
    </defs>
    <g filter="url(#export-goo-filter)">
        ${cellsMarkup}
    </g>
</svg>`
}

async function rasterizeSvgAlphaField(svgMarkup, width, height) {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
        return null
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d', { willReadFrequently: true })

    if (!context) {
        return null
    }

    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    try {
        const image = await new Promise((resolve, reject) => {
            const nextImage = new Image()

            nextImage.onload = () => resolve(nextImage)
            nextImage.onerror = () => reject(new Error('Unable to rasterize SVG export source.'))
            nextImage.src = url
        })

        context.clearRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)

        return context.getImageData(0, 0, width, height).data
    } finally {
        URL.revokeObjectURL(url)
    }
}

async function buildRenderedGooField(aliveCells, rowCount, colCount) {
    const scale = EXPORT_TRACE_SCALE
    const width = Math.ceil((colCount + GOO_BLEED * 2) * scale)
    const height = Math.ceil((rowCount + GOO_BLEED * 2) * scale)
    const svgMarkup = buildGooRasterSvgMarkup({
        aliveCells,
        rowCount,
        colCount,
        pixelWidth: width,
        pixelHeight: height,
    })
    const imageData = await rasterizeSvgAlphaField(svgMarkup, width, height)

    if (!imageData) {
        return null
    }

    const field = new Float32Array(width * height)

    for (let index = 0; index < field.length; index += 1) {
        field[index] = imageData[index * 4 + 3] / 255
    }

    return {
        field,
        width,
        height,
        padding: GOO_BLEED * scale,
        scale,
    }
}

function interpolateIsoValue(startValue, endValue, isoValue) {
    const delta = endValue - startValue

    if (Math.abs(delta) < 0.000001) {
        return 0.5
    }

    return Math.min(1, Math.max(0, (isoValue - startValue) / delta))
}

function extractContourSegments(field, width, height, isoValue) {
    const segments = []

    for (let y = 0; y < height - 1; y += 1) {
        const rowOffset = y * width
        const nextRowOffset = rowOffset + width

        for (let x = 0; x < width - 1; x += 1) {
            const topLeft = field[rowOffset + x]
            const topRight = field[rowOffset + x + 1]
            const bottomRight = field[nextRowOffset + x + 1]
            const bottomLeft = field[nextRowOffset + x]
            const topLeftInside = topLeft >= isoValue
            const topRightInside = topRight >= isoValue
            const bottomRightInside = bottomRight >= isoValue
            const bottomLeftInside = bottomLeft >= isoValue
            const intersections = []

            if (topLeftInside !== topRightInside) {
                intersections.push({
                    edge: 'top',
                    point: {
                        x: x + 0.5 + interpolateIsoValue(topLeft, topRight, isoValue),
                        y: y + 0.5,
                    },
                })
            }

            if (topRightInside !== bottomRightInside) {
                intersections.push({
                    edge: 'right',
                    point: {
                        x: x + 1.5,
                        y: y + 0.5 + interpolateIsoValue(topRight, bottomRight, isoValue),
                    },
                })
            }

            if (bottomLeftInside !== bottomRightInside) {
                intersections.push({
                    edge: 'bottom',
                    point: {
                        x: x + 0.5 + interpolateIsoValue(bottomLeft, bottomRight, isoValue),
                        y: y + 1.5,
                    },
                })
            }

            if (topLeftInside !== bottomLeftInside) {
                intersections.push({
                    edge: 'left',
                    point: {
                        x: x + 0.5,
                        y: y + 0.5 + interpolateIsoValue(topLeft, bottomLeft, isoValue),
                    },
                })
            }

            if (intersections.length === 2) {
                segments.push({
                    a: intersections[0].point,
                    b: intersections[1].point,
                })
            }

            if (intersections.length !== 4) {
                continue
            }

            const centerValue = (topLeft + topRight + bottomRight + bottomLeft) / 4
            const pointByEdge = Object.fromEntries(intersections.map(({ edge, point }) => [edge, point]))

            if (topLeftInside && bottomRightInside && !topRightInside && !bottomLeftInside) {
                if (centerValue >= isoValue) {
                    segments.push({ a: pointByEdge.top, b: pointByEdge.right })
                    segments.push({ a: pointByEdge.bottom, b: pointByEdge.left })
                } else {
                    segments.push({ a: pointByEdge.top, b: pointByEdge.left })
                    segments.push({ a: pointByEdge.right, b: pointByEdge.bottom })
                }

                continue
            }

            if (topRightInside && bottomLeftInside && !topLeftInside && !bottomRightInside) {
                if (centerValue >= isoValue) {
                    segments.push({ a: pointByEdge.top, b: pointByEdge.left })
                    segments.push({ a: pointByEdge.right, b: pointByEdge.bottom })
                } else {
                    segments.push({ a: pointByEdge.top, b: pointByEdge.right })
                    segments.push({ a: pointByEdge.bottom, b: pointByEdge.left })
                }
            }
        }
    }

    return segments
}

function createContourPointKey(point) {
    return `${point.x.toFixed(4)},${point.y.toFixed(4)}`
}

function pointsMatch(leftPoint, rightPoint, epsilon = 0.0001) {
    return Math.abs(leftPoint.x - rightPoint.x) < epsilon && Math.abs(leftPoint.y - rightPoint.y) < epsilon
}

function simplifyContourLoop(points) {
    if (points.length <= 3) {
        return points
    }

    const dedupedPoints = points.filter(
        (point, index) => index === 0 || !pointsMatch(point, points[index - 1]),
    )

    if (dedupedPoints.length <= 3) {
        return dedupedPoints
    }

    return dedupedPoints.filter((point, index) => {
        const previousPoint = dedupedPoints[(index - 1 + dedupedPoints.length) % dedupedPoints.length]
        const nextPoint = dedupedPoints[(index + 1) % dedupedPoints.length]
        const firstVectorX = point.x - previousPoint.x
        const firstVectorY = point.y - previousPoint.y
        const secondVectorX = nextPoint.x - point.x
        const secondVectorY = nextPoint.y - point.y
        const crossProduct = firstVectorX * secondVectorY - firstVectorY * secondVectorX
        const dotProduct = firstVectorX * secondVectorX + firstVectorY * secondVectorY

        return Math.abs(crossProduct) > 0.0001 || dotProduct < 0
    })
}

function connectContourSegments(segments) {
    const pointLookup = new Map()
    const adjacency = new Map()
    const visitedSegments = new Array(segments.length).fill(false)

    const registerPoint = (point) => {
        const key = createContourPointKey(point)

        if (!pointLookup.has(key)) {
            pointLookup.set(key, point)
        }

        return key
    }

    const registerAdjacency = (fromKey, toKey, segmentIndex) => {
        const edges = adjacency.get(fromKey) || []

        edges.push({ otherKey: toKey, segmentIndex })
        adjacency.set(fromKey, edges)
    }

    segments.forEach(({ a, b }, segmentIndex) => {
        const startKey = registerPoint(a)
        const endKey = registerPoint(b)

        registerAdjacency(startKey, endKey, segmentIndex)
        registerAdjacency(endKey, startKey, segmentIndex)
    })

    const loops = []

    segments.forEach(({ a, b }, segmentIndex) => {
        if (visitedSegments[segmentIndex]) {
            return
        }

        const startKey = createContourPointKey(a)
        let previousKey = startKey
        let currentKey = createContourPointKey(b)
        const loop = [pointLookup.get(startKey), pointLookup.get(currentKey)]

        visitedSegments[segmentIndex] = true

        while (currentKey !== startKey) {
            const candidates =
                adjacency
                    .get(currentKey)
                    ?.filter(
                        ({ otherKey, segmentIndex: nextSegmentIndex }) =>
                            !visitedSegments[nextSegmentIndex] && otherKey !== previousKey,
                    ) || []

            if (candidates.length === 0) {
                loop.length = 0
                break
            }

            const nextEdge = candidates[0]
            const nextKey = nextEdge.otherKey

            visitedSegments[nextEdge.segmentIndex] = true

            if (nextKey === startKey) {
                currentKey = startKey
                break
            }

            loop.push(pointLookup.get(nextKey))
            previousKey = currentKey
            currentKey = nextKey
        }

        if (loop.length >= 3 && currentKey === startKey) {
            loops.push(simplifyContourLoop(loop))
        }
    })

    return loops
}

function getPolygonArea(points) {
    let area = 0

    points.forEach((point, index) => {
        const nextPoint = points[(index + 1) % points.length]

        area += point.x * nextPoint.y - nextPoint.x * point.y
    })

    return area / 2
}

function formatSvgNumber(value) {
    const roundedValue = Number(value.toFixed(3))

    return String(Object.is(roundedValue, -0) ? 0 : roundedValue)
}

function scaleContourPoint(point, tracedField) {
    return {
        x: (point.x - tracedField.padding) / tracedField.scale,
        y: (point.y - tracedField.padding) / tracedField.scale,
    }
}

function distanceBetweenPoints(leftPoint, rightPoint) {
    return Math.hypot(rightPoint.x - leftPoint.x, rightPoint.y - leftPoint.y)
}

function resampleClosedLoop(points, spacing) {
    if (points.length < 3 || spacing <= 0) {
        return points
    }

    const cumulativeLengths = [0]

    for (let index = 0; index < points.length; index += 1) {
        const nextPoint = points[(index + 1) % points.length]
        cumulativeLengths.push(cumulativeLengths[index] + distanceBetweenPoints(points[index], nextPoint))
    }

    const totalLength = cumulativeLengths[cumulativeLengths.length - 1]

    if (totalLength === 0) {
        return points
    }

    const sampleCount = Math.max(3, Math.round(totalLength / spacing))
    const resampledPoints = []
    let segmentIndex = 0

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const targetDistance = (sampleIndex / sampleCount) * totalLength

        while (
            segmentIndex < points.length - 1 &&
            cumulativeLengths[segmentIndex + 1] < targetDistance
        ) {
            segmentIndex += 1
        }

        const pointA = points[segmentIndex]
        const pointB = points[(segmentIndex + 1) % points.length]
        const segmentStart = cumulativeLengths[segmentIndex]
        const segmentEnd = cumulativeLengths[segmentIndex + 1]
        const segmentLength = segmentEnd - segmentStart
        const progress = segmentLength === 0 ? 0 : (targetDistance - segmentStart) / segmentLength

        resampledPoints.push({
            x: pointA.x + (pointB.x - pointA.x) * progress,
            y: pointA.y + (pointB.y - pointA.y) * progress,
        })
    }

    return resampledPoints
}

function chaikinSmoothClosedLoop(points, iterations) {
    let currentPoints = points

    for (let iteration = 0; iteration < iterations; iteration += 1) {
        if (currentPoints.length < 3) {
            return currentPoints
        }

        const nextPoints = []

        currentPoints.forEach((point, index) => {
            const nextPoint = currentPoints[(index + 1) % currentPoints.length]

            nextPoints.push({
                x: point.x * 0.75 + nextPoint.x * 0.25,
                y: point.y * 0.75 + nextPoint.y * 0.25,
            })
            nextPoints.push({
                x: point.x * 0.25 + nextPoint.x * 0.75,
                y: point.y * 0.25 + nextPoint.y * 0.75,
            })
        })

        currentPoints = nextPoints
    }

    return currentPoints
}

function buildClosedBezierPathData(points) {
    if (points.length < 3) {
        return ''
    }

    const commands = [`M ${formatSvgNumber(points[0].x)} ${formatSvgNumber(points[0].y)}`]

    points.forEach((point, index) => {
        const previousPoint = points[(index - 1 + points.length) % points.length]
        const nextPoint = points[(index + 1) % points.length]
        const nextNextPoint = points[(index + 2) % points.length]
        const controlPointOne = {
            x: point.x + ((nextPoint.x - previousPoint.x) * EXPORT_CURVE_TENSION) / 6,
            y: point.y + ((nextPoint.y - previousPoint.y) * EXPORT_CURVE_TENSION) / 6,
        }
        const controlPointTwo = {
            x: nextPoint.x - ((nextNextPoint.x - point.x) * EXPORT_CURVE_TENSION) / 6,
            y: nextPoint.y - ((nextNextPoint.y - point.y) * EXPORT_CURVE_TENSION) / 6,
        }

        commands.push(
            `C ${formatSvgNumber(controlPointOne.x)} ${formatSvgNumber(controlPointOne.y)} ${formatSvgNumber(controlPointTwo.x)} ${formatSvgNumber(controlPointTwo.y)} ${formatSvgNumber(nextPoint.x)} ${formatSvgNumber(nextPoint.y)}`,
        )
    })

    commands.push('Z')

    return commands.join(' ')
}

async function buildTracedGooPathData(aliveCells, rowCount, colCount) {
    const renderedField = await buildRenderedGooField(aliveCells, rowCount, colCount)
    const tracedField = renderedField || buildApproximateGooField(aliveCells, rowCount, colCount)

    if (!tracedField) {
        return ''
    }

    const loops = connectContourSegments(
        extractContourSegments(
            tracedField.field,
            tracedField.width,
            tracedField.height,
            renderedField ? EXPORT_TRACE_THRESHOLD : GOO_ALPHA_THRESHOLD,
        ),
    )

    return loops
        .filter((loop) => loop.length >= 3 && Math.abs(getPolygonArea(loop)) > 2)
        .map((loop) =>
            buildClosedBezierPathData(
                EXPORT_SMOOTHING_PASSES > 0
                    ? chaikinSmoothClosedLoop(
                        resampleClosedLoop(
                            loop.map((point) => scaleContourPoint(point, tracedField)),
                            EXPORT_RESAMPLE_SPACING,
                        ),
                        EXPORT_SMOOTHING_PASSES,
                    )
                    : resampleClosedLoop(
                        loop.map((point) => scaleContourPoint(point, tracedField)),
                        EXPORT_RESAMPLE_SPACING,
                    ),
            ),
        )
        .filter(Boolean)
        .join(' ')
}

function escapeSvgText(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;')
}

async function buildBoardSvgMarkup({
    aliveCells,
    wordLayouts,
    cellSize,
    rowCount,
    colCount,
}) {
    const exportMinX = -GOO_BLEED
    const exportMinY = -GOO_BLEED
    const exportWidthUnits = colCount + GOO_BLEED * 2
    const exportHeightUnits = rowCount + GOO_BLEED * 2
    const exportWidth = exportWidthUnits * 64
    const exportHeight = exportHeightUnits * 64
    const gooPathData = await buildTracedGooPathData(aliveCells, rowCount, colCount)
    const wordText = wordLayouts
        .map((layout) => {
            const x = layout.col + layout.widthCells / 2
            const y = layout.row + layout.heightCells / 2
            const fontSize = layout.fontSize / cellSize

            return `
        <text
            x="${x}"
            y="${y}"
            fill="${EXPORT_WORD_FILL}"
            font-family="${WORD_FONT}"
            font-size="${fontSize}"
            font-weight="${WORD_FONT_WEIGHT}"
            letter-spacing="${WORD_LETTER_SPACING_EM}em"
            text-anchor="middle"
            dominant-baseline="middle"
        >${escapeSvgText(layout.word)}</text>`
        })
        .join('')

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="${formatSvgNumber(exportMinX)} ${formatSvgNumber(exportMinY)} ${formatSvgNumber(exportWidthUnits)} ${formatSvgNumber(exportHeightUnits)}">
    ${gooPathData ? `<path d="${gooPathData}" fill="${INK_COLOR}" fill-rule="evenodd" />` : ''}
    ${wordText}
</svg>`
}

function downloadSvg(filename, svgMarkup) {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()

    window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

const LoopingVideo = memo(function LoopingVideo({
    className,
    poster,
    src,
    style,
    preload = 'metadata',
}) {
    const videoRef = useRef(null)

    useEffect(() => {
        const video = videoRef.current

        if (!video) return undefined

        const ensurePlayback = async () => {
            video.defaultMuted = true
            video.muted = true
            video.loop = true
            video.playsInline = true

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
    }, [src])

    return (
        <video
            key={src}
            ref={videoRef}
            className={className}
            src={src}
            poster={poster}
            style={style}
            autoPlay
            defaultMuted
            muted
            loop
            playsInline
            preload={preload}
            aria-hidden="true"
        />
    )
})

const BoardVideo = memo(function BoardVideo({ bleedStyle, poster, src }) {
    return <LoopingVideo className="board-video" src={src} poster={poster} style={bleedStyle} preload="metadata" />
})

const VideoThumbnailButton = memo(function VideoThumbnailButton({
    active,
    label,
    onClick,
    thumbnailSrc,
}) {
    return (
        <button
            className={`video-swatch ${active ? 'is-active' : ''}`}
            onClick={onClick}
            type="button"
            aria-pressed={active}
            aria-label={`Switch to ${label}`}
        >
            <img className="video-swatch-image" src={thumbnailSrc} alt="" />
        </button>
    )
})

export default function App() {
    const [grid, setGrid] = useState(() => createPatternGrid(PULSAR_PATTERN, GRID_SIZE))
    const [running, setRunning] = useState(true)
    const [videoIndex, setVideoIndex] = useState(0)
    const [hoveredCell, setHoveredCell] = useState(null)
    const [wordLayouts, setWordLayouts] = useState([])
    const [boardBounds, setBoardBounds] = useState({ width: 0, height: 0 })
    const boardFrameRef = useRef(null)
    const drawingStateRef = useRef({
        active: false,
        value: 0,
        paintedCellKeys: new Set(),
    })
    const blockedDeadCellKeysRef = useRef(new Set())
    const svgToken = useId().replace(/:/g, '')
    const gooFilterId = `${svgToken}-goo-filter`
    const overlayMaskId = `${svgToken}-overlay-mask`
    const rowCount = grid.length
    const colCount = grid[0].length
    const currentVideo = SEA_VIDEOS[videoIndex] ?? SEA_VIDEOS[0]
    const currentVideoSrc = currentVideo.src
    const maskX = -MASK_BLEED
    const maskY = -MASK_BLEED
    const maskWidth = colCount + MASK_BLEED * 2
    const maskHeight = rowCount + MASK_BLEED * 2
    const aliveCells = useMemo(
        () =>
            grid.flatMap((row, rowIndex) =>
                row.flatMap((cell, colIndex) => (cell ? [{ rowIndex, colIndex }] : [])),
            ),
        [grid],
    )
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
    const blockedDeadCellKeys = useMemo(() => {
        const nextBlockedCells = new Set()

        grid.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
                if (cell === 1) {
                    return
                }

                const candidateGrid = setCellValue(grid, rowIndex, colIndex, 1)
                const { grid: resolvedGrid } = resolveWordLayouts(candidateGrid, wordFootprints)

                if (resolvedGrid[rowIndex]?.[colIndex] !== 1) {
                    nextBlockedCells.add(getCellKey(rowIndex, colIndex))
                }
            })
        })

        return nextBlockedCells
    }, [grid, wordFootprints])
    const hoverPreviewCell =
        hoveredCell &&
        grid[hoveredCell.rowIndex]?.[hoveredCell.colIndex] === 0 &&
        !blockedDeadCellKeys.has(getCellKey(hoveredCell.rowIndex, hoveredCell.colIndex))
            ? hoveredCell
            : null
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
        blockedDeadCellKeysRef.current = blockedDeadCellKeys
    }, [blockedDeadCellKeys])

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

    const stopDrawing = () => {
        const drawingState = drawingStateRef.current
        drawingState.active = false
        drawingState.paintedCellKeys.clear()
    }

    useEffect(() => {
        window.addEventListener('pointerup', stopDrawing)
        window.addEventListener('pointercancel', stopDrawing)

        return () => {
            window.removeEventListener('pointerup', stopDrawing)
            window.removeEventListener('pointercancel', stopDrawing)
        }
    }, [])

    const setCellState = (row, col, value) => {
        if (value === 1 && blockedDeadCellKeysRef.current.has(getCellKey(row, col))) {
            return
        }

        setGrid((currentGrid) => {
            if (currentGrid[row]?.[col] === value) {
                return currentGrid
            }

            return setCellValue(currentGrid, row, col, value)
        })
    }

    const paintCell = (row, col, value) => {
        const drawingState = drawingStateRef.current
        const cellKey = getCellKey(row, col)

        if (value === 1 && blockedDeadCellKeysRef.current.has(cellKey)) {
            return
        }

        if (drawingState.active) {
            if (drawingState.paintedCellKeys.has(cellKey)) {
                return
            }

            drawingState.paintedCellKeys.add(cellKey)
        }

        setCellState(row, col, value)
    }

    const toggleCell = (row, col) => {
        if (grid[row][col] === 0 && blockedDeadCellKeys.has(getCellKey(row, col))) {
            return
        }

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
    const exportSvg = async () => {
        const svgMarkup = await buildBoardSvgMarkup({
            aliveCells,
            wordLayouts,
            cellSize,
            rowCount,
            colCount,
        })
        const timestamp = new Date().toISOString().replaceAll(':', '-')

        downloadSvg(`game-of-life-grid-${timestamp}.svg`, svgMarkup)
    }
    return (
        <main className="app-shell">
            <aside className="sidebar left-sidebar">
                <div className="controls">
                    <button onClick={() => setRunning((value) => !value)}>{running ? 'Stop' : 'Start'}</button>
                    <button onClick={() => setGrid((current) => nextGeneration(current))}>Step</button>
                    <button onClick={randomize}>Randomize</button>
                    <button onClick={reset}>Clear</button>
                </div>
                <div className="video-picker" role="group" aria-label="Choose sea video">
                    {SEA_VIDEOS.map((video, index) => (
                        <VideoThumbnailButton
                            key={video.id}
                            active={index === videoIndex}
                            label={video.label}
                            onClick={() => setVideoIndex(index)}
                            thumbnailSrc={video.thumbnailSrc}
                        />
                    ))}
                </div>
            </aside>

            <section className="center-panel">
                <div ref={boardFrameRef} className="board-frame">
                    <BoardVideo bleedStyle={bleedStyle} poster={currentVideo.thumbnailSrc} src={currentVideoSrc} />
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
                                <feMorphology
                                    in="SourceGraphic"
                                    operator="dilate"
                                    radius={GOO_DILATE_RADIUS}
                                    result="expanded"
                                />
                                <feGaussianBlur in="expanded" stdDeviation={GOO_BLUR_RADIUS} result="blurred" />
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
                                            rx={CELL_RADIUS}
                                            ry={CELL_RADIUS}
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
                                    rx={CELL_RADIUS}
                                    ry={CELL_RADIUS}
                                    fill={INK_COLOR}
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
                            row.map((cell, colIndex) => {
                                const isBlocked = cell === 0 && blockedDeadCellKeys.has(getCellKey(rowIndex, colIndex))

                                return (
                                    <button
                                        key={`${rowIndex}-${colIndex}`}
                                        className={`cell ${cell ? 'alive' : 'dead'} ${isBlocked ? 'cell-blocked' : ''}`}
                                        onMouseEnter={() =>
                                            setHoveredCell(isBlocked ? null : { rowIndex, colIndex })
                                        }
                                        onPointerDown={(event) => {
                                            if (event.button !== 0 || isBlocked) {
                                                return
                                            }

                                            event.preventDefault()

                                            const nextValue = cell ? 0 : 1
                                            const drawingState = drawingStateRef.current
                                            drawingState.active = true
                                            drawingState.value = nextValue
                                            drawingState.paintedCellKeys.clear()

                                            paintCell(rowIndex, colIndex, nextValue)
                                        }}
                                        onPointerEnter={() => {
                                            setHoveredCell(isBlocked ? null : { rowIndex, colIndex })

                                            const drawingState = drawingStateRef.current

                                            if (!drawingState.active) {
                                                return
                                            }

                                            paintCell(rowIndex, colIndex, drawingState.value)
                                        }}
                                        onPointerUp={stopDrawing}
                                        onFocus={() => {
                                            if (!isBlocked) {
                                                setHoveredCell({ rowIndex, colIndex })
                                            }
                                        }}
                                        onClick={(event) => {
                                            if (event.detail === 0) {
                                                toggleCell(rowIndex, colIndex)
                                            }
                                        }}
                                        type="button"
                                        tabIndex={isBlocked ? -1 : 0}
                                        aria-label={
                                            isBlocked
                                                ? `Cell ${rowIndex}, ${colIndex} unavailable`
                                                : `Cell ${rowIndex}, ${colIndex}`
                                        }
                                        aria-disabled={isBlocked}
                                    />
                                )
                            }),
                        )}
                    </div>
                </div>
            </section>

            <aside className="sidebar right-sidebar">
                <div className="content-block">
                    <h2>About</h2>
                    <p>
                        This project is a reinterpretation of John Conway&apos;s <a href="https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life">Game of Life</a> through the
                        theme of digital daydreaming. The idea came from zoning out while watching waves and the way light moves across the surface
                        of the sea. 
                    </p>
                    <p>
                        Both the sea and the Game of Life can create complex, shifting forms from a
                        small number of simple conditions, while one is a natural phenomenon and the other is a mathematical abstraction. 
                        The goal of this project is to explore the
                        similarities between them and to create a space for play.
                    </p>
                </div>
                <div className="content-block">
                    <h2>Rules</h2>
                    <p>
                        It is often described as a zero-player game because, once it
                        begins, there is no need for anyone to control it.
                    </p>
                    <p>   
                        Each cell responds to the eight cells around it. A live cell with two or three neighbors
                        survives. A dead cell with exactly three neighbors becomes alive. All other cells die or remain
                        dead.
                    </p>
                </div>
                <div className="content-block">
                    <h2>Interact</h2>
                    <p>
                        Click or drag across cells to add or remove them and create a starting pattern. Press{' '}
                        <strong>Start</strong> to let the simulation develop on its own, or use <strong>Step</strong>{' '}
                        to move through it one generation at a time.
                    </p>
                    <p>
                        You can also click directly on the board while it is running. This immediately interrupts the
                        current pattern and changes how it develops. Pausing the simulation gives you more time to
                        build deliberate or complex arrangements before setting them in motion again.{' '}
                    </p>
                </div>
            </aside>
        </main>
    )
}
