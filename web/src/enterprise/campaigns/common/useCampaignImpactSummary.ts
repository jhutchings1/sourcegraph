import { uniq } from 'lodash'
import { useEffect, useState } from 'react'
import { map } from 'rxjs/operators'
import { dataOrThrowErrors, gql } from '../../../../../shared/src/graphql/graphql'
import * as GQL from '../../../../../shared/src/graphql/schema'
import { asError, ErrorLike } from '../../../../../shared/src/util/errors'
import { queryGraphQL } from '../../../backend/graphql'
import { diffStatFieldsFragment } from '../../../repo/compare/RepositoryCompareDiffPage'

export interface CampaignImpactSummary {
    repositories: number
    files: number
    diffStat: GQL.IDiffStat
}

const LOADING: 'loading' = 'loading'

type Result = typeof LOADING | CampaignImpactSummary | ErrorLike

export function useCampaignImpactSummary(campaign: Pick<GQL.ICampaign, 'id'>): Result {
    const [result, setResult] = useState<Result>(LOADING)
    useEffect(() => {
        const subscription = queryGraphQL(
            gql`
                query CampaignFileDiffs($campaign: ID!) {
                    node(id: $campaign) {
                        __typename
                        ... on Campaign {
                            repositoryComparisons {
                                baseRepository {
                                    id
                                }
                                fileDiffs {
                                    totalCount
                                    diffStat {
                                        ...DiffStatFields
                                    }
                                }
                            }
                        }
                    }
                }
                ${diffStatFieldsFragment}
            `,
            { campaign: campaign.id }
        )
            .pipe(
                map(dataOrThrowErrors),
                map(data => {
                    if (!data || !data.node || data.node.__typename !== 'Campaign') {
                        throw new Error('campaign not found')
                    }
                    const result: CampaignImpactSummary = {
                        repositories: uniq(data.node.repositoryComparisons.map(c => c.baseRepository.id)).length,
                        files: data.node.repositoryComparisons.reduce((n, c) => n + (c.fileDiffs.totalCount || 0), 0),
                        diffStat: sumDiffStats(data.node.repositoryComparisons.map(c => c.fileDiffs.diffStat)),
                    }
                    return result
                })
            )
            .subscribe(setResult, err => setResult(asError(err)))
        return () => subscription.unsubscribe()
    }, [campaign])
    return result
}

function sumDiffStats(diffStats: GQL.IDiffStat[]): GQL.IDiffStat {
    const sum: GQL.IDiffStat = {
        __typename: 'DiffStat',
        added: 0,
        changed: 0,
        deleted: 0,
    }
    for (const diffStat of diffStats) {
        sum.added += diffStat.added
        sum.changed += diffStat.changed
        sum.deleted += diffStat.deleted
    }
    return sum
}