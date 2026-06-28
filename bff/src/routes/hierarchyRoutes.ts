import { Router } from 'express';
import { asyncWrapper } from '../middleware/asyncWrapper';
import { getRelationTypes, getProjects, getWorkItemTypeMeta, getQueries, validateConnection } from '../controllers/MetadataController';
import { postLinks, postWorkItems, postHierarchy } from '../controllers/HierarchyController';

export const hierarchyRouter = Router();

hierarchyRouter.get('/validate-connection', asyncWrapper(validateConnection));
hierarchyRouter.get('/relation-types', asyncWrapper(getRelationTypes));
hierarchyRouter.get('/projects', asyncWrapper(getProjects));
hierarchyRouter.get('/work-item-type-meta', asyncWrapper(getWorkItemTypeMeta));
hierarchyRouter.get('/queries', asyncWrapper(getQueries));
hierarchyRouter.post('/links', asyncWrapper(postLinks));
hierarchyRouter.post('/workitems', asyncWrapper(postWorkItems));
hierarchyRouter.post('/hierarchy', asyncWrapper(postHierarchy));
