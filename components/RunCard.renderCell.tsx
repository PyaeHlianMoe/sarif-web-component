// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import './RunCard.renderCell.scss'
import * as React from 'react'
import {Fragment} from 'react'
import * as ReactMarkdown from 'react-markdown'
import {Result} from 'sarif'

import {Hi} from './Hi'
import {tryOr, tryLink} from './try'
import {Rule, More, ResultOrRuleOrMore} from './Viewer.Types'
import {Snippet} from './Snippet'

import {css} from 'azure-devops-ui/Util'
import {Link} from 'azure-devops-ui/Link'
import {ObservableLike} from 'azure-devops-ui/Core/Observable'
import {Status, Statuses, StatusSize} from "azure-devops-ui/Status"
import {PillSize, Pill} from 'azure-devops-ui/Pill'
import {ISimpleTableCell, TableCell} from 'azure-devops-ui/Table'
import {ExpandableTreeCell, ITreeColumn} from 'azure-devops-ui/TreeEx'
import {ITreeItemEx, ITreeItem} from 'azure-devops-ui/Utilities/TreeItemProvider'
import {Icon, IconSize} from 'azure-devops-ui/Icon'
import { renderPathCell } from './RunCard.renderPathCell'
import { SnippetActionContext } from './Viewer'

const colspan = 99 // No easy way to parameterize this, however extra does not hurt, so using an arbitrarily large value.

export function renderCell<T extends ISimpleTableCell>(
	rowIndex: number,
	columnIndex: number,
	treeColumn: ITreeColumn<T>,
	treeItem: ITreeItemEx<T>): JSX.Element {

	const data = ObservableLike.getValue(treeItem.underlyingItem.data)
	const commonProps = {
		className: treeColumn.className,
		columnIndex,
		treeItem,
		treeColumn,
	}

	// ROW AGE
	const isAge = (item => item.isAge) as (item: any) => item is { name: string, treeItem: ITreeItem<ResultOrRuleOrMore> }
	if (isAge(data)) {
		const age = data
		return columnIndex === 0
			? ExpandableTreeCell({
				children: <div className="swcRowRule">{/* Div for flow layout. */}
					{age.name}
					<Pill size={PillSize.compact}>{age.treeItem.childItemsAll.length}</Pill>
				</div>,
				colspan,
				...commonProps,
			})
			: null
	}

	// ROW RULE
	const isRule = (item => item.isRule) as (item: any) => item is Rule
	if (isRule(data)) {
		const rule = data
		return columnIndex === 0
			? ExpandableTreeCell({
				children: <div className="swcRowRule">{/* Div for flow layout. */}
					{tryLink(() => rule.helpUri, <Hi>{rule.id || rule.guid}</Hi>)}
					{tryOr(() => rule.name && <>: <Hi>{rule.name}</Hi></>)}
					{tryOr(() => rule.relationships.map((rel, i) => {
						const taxon = rule.run.taxonomies[rel.target.toolComponent.index].taxa[rel.target.index]
						return <Fragment key={rel.target.id}>{i > 0 ? ',' : ''} {tryLink(() => taxon.helpUri, taxon.name)}</Fragment>
					}))}
					<Pill size={PillSize.compact}>{rule.treeItem.childItemsAll.length}</Pill>
				</div>,
				colspan,
				...commonProps,
			})
			: null
	}

	// ROW RESULT
	const capitalize = str => `${str[0].toUpperCase()}${str.slice(1)}`
	const isResult = (item => item.message !== undefined) as (item: any) => item is Result
	if (isResult(data)) {
		const result = data
		const status = {
			none: result.kind === 'pass' ? Statuses.Success : Statuses.Queued,
			note: Statuses.Information,
			error: Statuses.Failed,
		}[result.level] || Statuses.Warning
		return columnIndex === 0
			// ExpandableTreeCell (td div.bolt-table-cell-content.flex-row.flex-center TreeExpand children)
			// calls SimpleTableCell - adds an extra div
			// calls TableCell
			? ExpandableTreeCell({ // As close to Table#TwoLineTableCell (which calls TableCell) as possible.
				children: <>
					<Status {...status} className="bolt-table-two-line-cell-icon flex-noshrink bolt-table-status-icon" size={StatusSize.m} ariaLabel={result.level || 'warning'} />
					{renderPathCell(result)}
				</>,
				...commonProps,
			})
			: TableCell({ // Don't want SimpleTableCell as it has flex row.
				children: (() => {
					const rule = result._rule
					switch (treeColumn.id) {
						case 'Details':
							const messageFromRule = result._rule?.messageStrings?.[result.message.id ?? -1] ?? result.message;
							const formattedMessage = format(messageFromRule.text || result.message?.text, result.message.arguments) ?? '';
							const formattedMarkdown = format(messageFromRule.markdown || result.message?.markdown, result.message.arguments); // No '—', leave undefined if empty.
							return <>
								{formattedMarkdown
									? <div className="swcMarkDown">
										<ReactMarkdown source={formattedMarkdown}
											renderers={{ link: ({href, children}) => <a href={href} target="_blank">{children}</a> }} />
									</div> // Div to cancel out containers display flex row.
									: <Hi>{renderMessageWithEmbeddedLinks(result, formattedMessage)}</Hi> || ''}
								{tryOr(() => <SnippetActionContext.Consumer>
									{onSnippetAction => {
										// Optional chaining required here as the Context Consumer bypasses the tryOr
										return <Snippet ploc={result.locations?.[0]?.physicalLocation} action={() => onSnippetAction?.(result)} />
									}}
								</SnippetActionContext.Consumer>)}
							</>
						case 'Rule':
							return <>
								{tryLink(() => rule.helpUri, <Hi>{rule.id || rule.guid}</Hi>)}
								{tryOr(() => rule.name && <>: <Hi>{rule.name}</Hi></>)}
							</>
						case 'Baseline':
							return <Hi>{result.baselineState && capitalize(result.baselineState) || 'New'}</Hi>
						case 'Bug':
							return tryOr(() => <Link href={result.workItemUris[0]} target="_blank">
								<Icon iconName="LadybugSolid" size={IconSize.medium} style={{ color: '#E81123' }} />
							</Link>)
						case 'Age':
							return <Hi>{result.sla}</Hi>
						case 'FirstObserved':
							return <Hi>{result.firstDetection.toLocaleDateString()}</Hi>
					}
				})(),
				className: css(treeColumn.className, 'font-size'),
				columnIndex,
			})
	}

	// ROW MORE
	const isMore = (item => item.onClick !== undefined) as (item: any) => item is More
	if (isMore(data)) {
		return columnIndex === 0
			? ExpandableTreeCell({
				children: <Link onClick={data.onClick} tabIndex={-1}>Show All</Link>,
				colspan,
				...commonProps
			})
			: null
	}

	return null
}

// Replace [text](relatedIndex) with <a href />
function renderMessageWithEmbeddedLinks(result: Result, message: string) {
	const rxLink = /\[([^\]]*)\]\(([^\)]+)\)/ // Matches [text](id). Similar to below, but with an extra grouping around the id part.
	return message.match(rxLink)
		? message
			.split(/(\[[^\]]*\]\([^\)]+\))/g)
			.map((item, i) => {
				if (i % 2 === 0) return item
				const [_, text, id] = item.match(rxLink)
				const href = isNaN(id as any)
					? id
					  // RelatedLocations is typically [{ id: 1, ...}, { id: 2, ...}]
					  // Consider using [].find inside of assuming the index correlates to the id.
					: result.relatedLocations[+id - 1].physicalLocation.artifactLocation.uri
						+ tryOr(() => `#L${result.locations[0].physicalLocation.region.startLine}`, '')
				return <a key={i} href={href} target="_blank">{text}</a>
			})
		: message
}

// Borrowed from sarif-vscode-extension.
function format(template: string | undefined, args?: string[]) {
	if (!template) return undefined;
	if (!args) return template;
	return template.replace(/{(\d+)}/g, (_, group) => args[group]);
}
